import "./env"
import express, { Request, Response } from "express"
import axios from "axios"
import * as cheerio from "cheerio"
import * as path from "path"
import * as fs from "fs"
import { EventEmitter } from "events"
import { Game, GameData, GameInput, MyrientGameListing } from "./app-types"
import {
  DEFAULT_MYRIENT_SOURCE,
  getMyrientSource,
  MYRIENT_SOURCES,
} from "./myrient-sources"
import { getLaunchBoxService } from "./launchbox-service"
import { getImageCacheService } from "./image-cache-service"
import {
  cleanTheGamesDBGameName,
  getTheGamesDBService,
} from "./thegamesdb-service"
import { getDatabaseService } from "./db-service"
import { getLaunchBoxBoxArtService } from "./launchbox-box-art-service"
import { logger } from "./logger"
import {
  requestSchemas,
  validateBody,
  validateParams,
  validateQuery,
} from "./validation"

const app = express()
const PORT = Number(process.env.PORT || "3001")
const HOST = process.env.HOST?.trim() || "127.0.0.1"

// Initialize services
const launchbox = getLaunchBoxService()
const launchboxBoxArt = getLaunchBoxBoxArtService()
const imageCache = getImageCacheService()
const thegamesdb = getTheGamesDBService()
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads")
const DATA_DIR = path.join(__dirname, "..", "data")
const SQLITE_DB_FILE = path.join(DATA_DIR, "games.db")
const databaseService = getDatabaseService(SQLITE_DB_FILE)

// Track active downloads for cancellation
const activeDownloads = new Map<
  number,
  {
    controller: AbortController
    writeStream: fs.WriteStream | null
    downloadPath: string
  }
>()

// Myrient best practices: https://myrient.erista.me/faq/
// - Respect server with proper delays
// - Use proper User-Agent
// - No hotlinking (we're using directory-based approach)
const MYRIENT_REQUEST_DELAY = 500 // Respectful delay between Myrient requests (ms)
const MYRIENT_USER_AGENT = "Myrient-Get/1.0 (+https://github.com/myrient-get)"

// Helper function to convert local file paths to HTTP URLs
function filePathToUrl(filePath: string): string {
  // If it's already a URL (http/https), return as-is
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath
  }

  // If it's a local file path, convert to /cached-images/{filename}
  if (filePath.includes("image-cache")) {
    const filename = path.basename(filePath)
    return `/cached-images/${filename}`
  }

  return ""
}

function isSafeLibraryFilename(filename: string): boolean {
  if (!filename || filename.includes("\0")) {
    return false
  }

  if (path.isAbsolute(filename) || path.basename(filename) !== filename) {
    return false
  }

  return ![".", "..", "./", "../"].includes(filename)
}

function assertSafeLibraryFilename(filename: string): void {
  if (!isSafeLibraryFilename(filename)) {
    throw new Error(`Unsafe filename received: ${filename}`)
  }
}

function getRelativeDownloadLabel(game: Pick<Game, "filename" | "source_id" | "downloaded">): string | null {
  if (game.downloaded !== 1) {
    return null
  }

  return `${game.source_id}\\${game.filename}`
}

function cachedImageUrlToFilePath(imageUrl: string): string | null {
  if (!imageUrl.startsWith("/cached-images/")) {
    return null
  }

  const filename = decodeURIComponent(imageUrl.replace("/cached-images/", ""))
  if (!filename || path.basename(filename) !== filename) {
    return null
  }

  const localPath = path.join(DATA_DIR, "image-cache", filename)
  return fs.existsSync(localPath) ? localPath : null
}

function getGameKey(game: Pick<Game, "filename" | "source_id">): string {
  return `${game.source_id}::${game.filename}`
}

function getDownloadPath(game: Pick<Game, "filename" | "source_id">): string {
  assertSafeLibraryFilename(game.filename)
  const resolvedPath = path.resolve(DOWNLOADS_DIR, game.source_id, game.filename)
  const sourceRoot = path.resolve(DOWNLOADS_DIR, game.source_id)

  if (!resolvedPath.startsWith(`${sourceRoot}${path.sep}`) && resolvedPath !== sourceRoot) {
    throw new Error(`Resolved download path escaped source directory for ${game.filename}`)
  }

  return resolvedPath
}

function collectFilesRecursively(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return []
  }

  const files: string[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(fullPath))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }

  return files
}

function scanDownloadIndex(): Map<string, string> {
  const filesByGameKey = new Map<string, string>()

  for (const source of MYRIENT_SOURCES) {
    const sourceDirectory = path.join(DOWNLOADS_DIR, source.id)
    for (const filePath of collectFilesRecursively(sourceDirectory)) {
      filesByGameKey.set(
        getGameKey({
          source_id: source.id,
          filename: path.basename(filePath),
        }),
        filePath,
      )
    }
  }

  for (const filePath of collectFilesRecursively(DOWNLOADS_DIR)) {
    const relativePath = path.relative(DOWNLOADS_DIR, filePath)
    if (relativePath.includes(path.sep)) {
      continue
    }

    filesByGameKey.set(
      getGameKey({
        source_id: DEFAULT_MYRIENT_SOURCE.id,
        filename: path.basename(filePath),
      }),
      filePath,
    )
  }

  return filesByGameKey
}

function reindexDownloadedGames(data: GameData): {
  reindexed: number
  cleared: number
  matchedFiles: number
  orphanedFiles: number
} {
  const diskIndex = scanDownloadIndex()
  const matchedKeys = new Set<string>()
  let reindexed = 0
  let cleared = 0

    for (const game of data.games) {
      if (!isSafeLibraryFilename(game.filename)) {
        logger.warn(`Skipping unsafe filename in download index: ${game.filename}`)
        continue
      }

      const key = getGameKey(game)
      const indexedDownloadPath = diskIndex.get(key) || null

    if (indexedDownloadPath) {
      matchedKeys.add(key)
      if (game.downloaded !== 1 || game.download_path !== indexedDownloadPath) {
        reindexed++
      }
      game.downloaded = 1
      game.download_path = indexedDownloadPath
      continue
    }

    if (game.downloaded === 1 || game.download_path) {
      game.downloaded = 0
      game.download_path = null
      cleared++
    }
  }

  return {
    reindexed,
    cleared,
    matchedFiles: matchedKeys.size,
    orphanedFiles: diskIndex.size - matchedKeys.size,
  }
}

// Ensure directories exist
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// Myrient Service - Respects server load and best practices
const Myrient = {
  lastRequestTime: 0,

  delay: async (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms))
  },

  // Rate limiting - Myrient asks to be respectful
  respectfulDelay: async (): Promise<void> => {
    const now = Date.now()
    const timeSinceLastRequest = now - Myrient.lastRequestTime
    if (timeSinceLastRequest < MYRIENT_REQUEST_DELAY) {
      await Myrient.delay(MYRIENT_REQUEST_DELAY - timeSinceLastRequest)
    }
    Myrient.lastRequestTime = Date.now()
  },

  fetchGames: async (): Promise<MyrientGameListing[]> => {
    try {
      const games: MyrientGameListing[] = []

      for (const source of MYRIENT_SOURCES) {
        await Myrient.respectfulDelay()

        const response = await axios.get(source.baseURL, {
          timeout: 10000,
          headers: {
            "User-Agent": MYRIENT_USER_AGENT,
            Accept: "text/html",
          },
        })

        const $ = cheerio.load(response.data)
        const rows = $("table tr").slice(2) // Skip header rows
        let sourceCount = 0

        rows.each((_index, element) => {
          const tds = $(element).find("td")
          if (tds.length >= 3) {
            const filename = $(tds[0]).text().trim()
            const size = $(tds[1]).text().trim()
            const date = $(tds[2]).text().trim()

            // Filter out directory navigation entries
            if (
              filename &&
              filename !== ".." &&
              filename !== "." &&
              filename !== "../" &&
              filename !== "./" &&
              !filename.startsWith("Parent") &&
              isSafeLibraryFilename(filename)
            ) {
              games.push({
                filename,
                size,
                date,
                source_id: source.id,
                source_url: source.baseURL,
                platform: source.platform,
              })
              sourceCount++
            }
          }
        })

        console.log(`Myrient: Found ${sourceCount} games in ${source.label}`)
      }

      console.log(
        `Myrient: Found ${games.length} games across ${MYRIENT_SOURCES.length} sources`,
      )
      return games
    } catch (error) {
      console.error("Myrient fetch error:", (error as Error).message)
      throw error
    }
  },
}

const DB = {
  load: (): GameData => databaseService.load(),
  save: (data: GameData): void => databaseService.replaceAllGames(data.games),
  getAll: (): Game[] => databaseService.getAllGames(),
  findById: (id: number): Game | undefined => databaseService.findGameById(id),
  findByFilename: (filename: string, sourceId?: string): Game | undefined =>
    databaseService.findGameByFilename(filename, sourceId),
  add: (game: GameInput): Game => databaseService.addGame(game),
  update: (id: number, updates: Partial<Game>): Game | undefined =>
    databaseService.updateGame(id, updates),
  delete: (id: number): void => databaseService.deleteGame(id),
}

// Middleware
app.use(express.json())
app.use(express.static(path.join(__dirname, "..", "public")))
// Serve cached images through HTTP
app.use(
  "/cached-images",
  express.static(path.join(__dirname, "..", "data", "image-cache")),
)

function toClientGame(
  game: Game,
): Omit<Game, "box_art" | "download_path"> & {
  box_art: string | null
  download_path: null
  download_label: string | null
} {
  return {
    ...game,
    download_path: null,
    download_label: getRelativeDownloadLabel(game),
    box_art: game.box_art ? filePathToUrl(game.box_art) : null,
  }
}

type RuntimeServiceState = {
  status: "ready" | "degraded" | "unavailable"
  detail?: string
}

const serviceStates: Record<string, RuntimeServiceState> = {
  launchbox: { status: "degraded", detail: "Not initialized" },
  imageCache: { status: "degraded", detail: "Not initialized" },
  thegamesdb: { status: "degraded", detail: "Not initialized" },
}

const metadataSyncState = {
  running: false,
  queued: 0,
  total: 0,
  completed: 0,
  updated: 0,
  failed: 0,
  lastRunAt: null as string | null,
}

const metadataSyncQueue = new Map<number, Game>()

async function syncMetadataForGame(game: Game): Promise<boolean> {
  const launchBoxMetadata = launchbox.getMetadata(game.name, game.platform)

  if (launchBoxMetadata) {
    DB.update(game.id, {
      release_date:
        launchBoxMetadata.releaseDate || launchBoxMetadata.releaseYear || undefined,
      description: launchBoxMetadata.overview,
      developer: launchBoxMetadata.developer,
      publisher: launchBoxMetadata.publisher,
    })
    return true
  }

  const gdbGame = await thegamesdb.searchGame(game.name)
  if (!gdbGame) {
    return false
  }

  const gdbMetadata = await thegamesdb.getGameMetadata(gdbGame.id)
  if (!gdbMetadata) {
    return false
  }

  DB.update(game.id, {
    gdb_id: gdbGame.id,
    release_date: gdbMetadata.releaseDate || undefined,
    description: gdbMetadata.overview,
    developer: gdbMetadata.developer,
    publisher: gdbMetadata.publisher,
  })
  return true
}

async function processMetadataSyncQueue(): Promise<void> {
  if (metadataSyncState.running || metadataSyncQueue.size === 0) {
    return
  }

  metadataSyncState.running = true
  metadataSyncState.total += metadataSyncQueue.size
  metadataSyncState.queued = metadataSyncQueue.size
  metadataSyncState.lastRunAt = new Date().toISOString()

  while (metadataSyncQueue.size > 0) {
    const [gameId, game] = metadataSyncQueue.entries().next().value as [number, Game]
    metadataSyncQueue.delete(gameId)
    metadataSyncState.queued = metadataSyncQueue.size

    try {
      const updated = await syncMetadataForGame(game)
      if (updated) {
        metadataSyncState.updated++
      } else {
        metadataSyncState.failed++
      }
    } catch (error) {
      metadataSyncState.failed++
      logger.warn(
        `Background metadata sync failed for "${game.name}"`,
        (error as Error).message,
      )
    } finally {
      metadataSyncState.completed++
    }
  }

  metadataSyncState.running = false
}

function queueMetadataSync(games: Game[]): void {
  for (const game of games) {
    if (game.release_date || game.description || game.developer || game.publisher) {
      continue
    }
    metadataSyncQueue.set(game.id, game)
  }

  metadataSyncState.queued = metadataSyncQueue.size
  void processMetadataSyncQueue()
}

async function downloadGameFile(
  game: Game,
  controller: AbortController,
): Promise<string> {
  const source = getMyrientSource(game.source_id, game.source_url)
  const downloadPath = getDownloadPath(game)
  const downloadUrl = source.baseURL + encodeURIComponent(game.filename)

  await Myrient.respectfulDelay()
  logger.info(`Starting download: ${game.filename}`, source.label)

  const response = await axios.get(downloadUrl, {
    responseType: "stream",
    timeout: 300000,
    headers: {
      "User-Agent": MYRIENT_USER_AGENT,
    },
    signal: controller.signal,
  })

  fs.mkdirSync(path.dirname(downloadPath), { recursive: true })
  const writeStream = fs.createWriteStream(downloadPath)

  return new Promise<string>((resolve, reject) => {
    let settled = false

    const finalizeError = (error: Error): void => {
      if (settled) {
        return
      }
      settled = true
      writeStream.destroy()
      fs.unlink(downloadPath, () => {
        /* ignore cleanup failure */
      })
      reject(error)
    }

    writeStream.on("finish", () => {
      if (settled) {
        return
      }
      settled = true
      DB.update(game.id, {
        downloaded: 1,
        download_path: downloadPath,
        downloaded_at: new Date().toISOString(),
      })
      resolve(downloadPath)
    })

    writeStream.on("error", (error: Error) => finalizeError(error))
    response.data.on("error", (error: Error) => finalizeError(error))

    controller.signal.addEventListener("abort", () => {
      finalizeError(
        Object.assign(new Error("Download cancelled"), { code: "ERR_CANCELED" }),
      )
    })

    response.data.pipe(writeStream)
  })
}

const queueEvents = new EventEmitter()
const queueRuntime = {
  processing: false,
  activeQueueId: null as number | null,
  activeGameId: null as number | null,
  controller: null as AbortController | null,
}

async function processDownloadQueue(): Promise<void> {
  if (queueRuntime.processing) {
    return
  }

  queueRuntime.processing = true
  queueEvents.emit("state")

  while (true) {
    const nextItem = databaseService.getNextPendingQueueItem()
    if (!nextItem?.game) {
      break
    }

    queueRuntime.activeQueueId = nextItem.id
    queueRuntime.activeGameId = nextItem.game_id
    queueRuntime.controller = new AbortController()
    databaseService.updateQueueStatus(nextItem.id, "downloading", null, true)
    queueEvents.emit("state")

    try {
      await downloadGameFile(nextItem.game, queueRuntime.controller)
      databaseService.updateQueueStatus(nextItem.id, "completed")
    } catch (error) {
      const refreshedItem = databaseService.getQueueItem(nextItem.id)
      const errorCode = (error as NodeJS.ErrnoException).code
      if (refreshedItem?.status === "paused" || refreshedItem?.status === "cancelled") {
        logger.info(`Queue item ${nextItem.id} interrupted: ${refreshedItem.status}`)
      } else if (errorCode === "ERR_CANCELED" || axios.isCancel(error)) {
        databaseService.updateQueueStatus(nextItem.id, "paused")
      } else {
        databaseService.updateQueueStatus(
          nextItem.id,
          "failed",
          (error as Error).message,
        )
      }
    } finally {
      queueRuntime.activeQueueId = null
      queueRuntime.activeGameId = null
      queueRuntime.controller = null
      queueEvents.emit("state")
    }
  }

  queueRuntime.processing = false
  queueEvents.emit("state")
}

// API: Fetch game list from Myrient
app.get(
  "/api/fetch-games",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info("Fetching games from Myrient")
      const games = await Myrient.fetchGames()

      // Clean game names consistently with TheGamesDB matching
      const gameInputs: GameInput[] = games.map((game) => ({
        filename: game.filename,
        name: cleanTheGamesDBGameName(game.filename),
        size: game.size,
        date: game.date,
        source_id: game.source_id,
        source_url: game.source_url,
        platform: game.platform,
        downloaded: 0,
        download_path: null,
      }))

      // Store in database
      let newCount = 0
      const newGames: Game[] = []
      gameInputs.forEach((game) => {
        // Check if game already exists
        if (!DB.findByFilename(game.filename, game.source_id)) {
          newGames.push(DB.add(game))
          newCount++
        }
      })

      queueMetadataSync(newGames)

      res.json({
        success: true,
        count: games.length,
        newGames: newCount,
        message: `Fetched ${games.length} games from Myrient (${newCount} new)`,
      })
    } catch (error) {
      console.error("Error fetching games:", (error as Error).message)
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Get all games from database
app.get("/api/games", (_req: Request, res: Response): void => {
  try {
    const games = DB.getAll()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toClientGame)
    res.json({ success: true, games })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

// API: Search games
app.get(
  "/api/search",
  validateQuery(requestSchemas.localSearch),
  (req: Request, res: Response): void => {
  try {
    const query = ((req.query.q as string) || "").toLowerCase()
    const games = DB.getAll()
      .filter(
        (game) =>
          game.name.toLowerCase().includes(query) ||
          game.filename.toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toClientGame)
    res.json({ success: true, games })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
},
)

// API: Download game
app.post(
  "/api/download",
  validateBody(requestSchemas.download),
  async (req: Request, res: Response): Promise<void> => {
    const { gameId } = req.body as {
      gameId: number
    }
    const game = DB.findById(Number(gameId))

    if (!game) {
      res.status(404).json({ success: false, error: "Game not found" })
      return
    }

    const controller = new AbortController()
    const downloadPath = getDownloadPath(game)
    activeDownloads.set(gameId, { controller, writeStream: null, downloadPath })

    try {
      const savedPath = await downloadGameFile(game, controller)
      activeDownloads.delete(gameId)
      res.json({
        success: true,
        message: "Download complete",
        downloadLabel: path.relative(DOWNLOADS_DIR, savedPath),
      })
    } catch (error) {
      activeDownloads.delete(gameId)
      const isCancelled =
        axios.isCancel(error) ||
        (error as NodeJS.ErrnoException).code === "ERR_CANCELED"
      if (isCancelled) {
        logger.info(`Download cancelled: ${game.filename}`)
        fs.unlink(downloadPath, () => {
          /* ignore */
        })
        if (!res.headersSent) {
          res.status(409).json({
            success: false,
            cancelled: true,
            error: "Download cancelled",
          })
        }
        return
      }
      logger.error("Download error", (error as Error).message)
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Cancel an active download
app.post(
  "/api/cancel-download",
  validateBody(requestSchemas.cancelDownload),
  (req: Request, res: Response): void => {
  const { gameId } = req.body as { gameId: number }
  const active = activeDownloads.get(Number(gameId))
  if (!active) {
    res.json({ success: false, error: "No active download found" })
    return
  }
  active.controller.abort()
  activeDownloads.delete(Number(gameId))
  res.json({ success: true, message: "Download cancelled" })
},
)

// API: Get download status
app.get("/api/downloaded", (_req: Request, res: Response): void => {
  try {
    const games = DB.getAll()
      .filter((game) => game.downloaded === 1)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toClientGame)
    res.json({ success: true, games })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

app.get("/api/recent-downloads", (_req: Request, res: Response): void => {
  try {
    res.json({
      success: true,
      games: databaseService.getRecentDownloaded(10).map(toClientGame),
    })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

// API: Reindex downloaded games from disk without refetching the library
app.post(
  "/api/reindex-downloads",
  (_req: Request, res: Response): void => {
    try {
      const data = DB.load()
      const result = reindexDownloadedGames(data)
      DB.save(data)

      res.json({
        success: true,
        ...result,
        message:
          `Download index rebuilt: ${result.matchedFiles} matched on disk, ` +
          `${result.reindexed} updated, ${result.cleared} cleared, ` +
          `${result.orphanedFiles} orphaned file(s)`,
      })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Delete downloaded game
app.delete("/api/game/:id", (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    const game = DB.findById(parseInt(id, 10))

    if (!game) {
      res.status(404).json({ success: false, error: "Game not found" })
      return
    }

    // Delete file if it exists
      if (
        game.download_path &&
        game.download_path.startsWith(path.resolve(DOWNLOADS_DIR)) &&
        fs.existsSync(game.download_path)
      ) {
        fs.unlink(game.download_path, (err) => {
          if (err) console.error("File deletion error:", err)
        })
    }

    // Update database
    DB.update(parseInt(id, 10), {
      downloaded: 0,
      download_path: null,
      downloaded_at: null,
    })

    res.json({ success: true, message: "Game deleted" })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

// API: Get statistics
app.get("/api/stats", (_req: Request, res: Response): void => {
  try {
    const allGames = DB.getAll()
    const stats = {
      total_games: allGames.length,
      downloaded_count: allGames.filter((game) => game.downloaded === 1).length,
    }
    res.json({ success: true, stats })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

// API: Fetch metadata and box art from LaunchBox
app.post(
  "/api/fetch-metadata",
  validateBody(requestSchemas.metadata),
  async (req: Request, res: Response): Promise<void> => {
    const { gameId, gameName } = req.body as {
      gameId: number
      gameName: string
    }

    try {
      console.log(`Fetching metadata for: "${gameName}"`)

      const game = DB.findById(gameId)
      const metadata = launchbox.getMetadata(gameName, game?.platform)

      if (metadata) {
        console.log(`✓ Found metadata for "${gameName}":`, metadata)

        // Prepare update object with LaunchBox data (no image fetching)
        const updates: any = {
          release_date: metadata.releaseDate || metadata.releaseYear,
          description: metadata.overview,
          developer: metadata.developer,
          publisher: metadata.publisher,
        }

        DB.update(gameId, updates)

        res.json({
          success: true,
          message: "Metadata fetched from LaunchBox",
          metadata,
          source: "launchbox",
          box_art: null, // No auto-fetching from LaunchBox
        })
      } else {
        console.log(`✗ No metadata found in LaunchBox for "${gameName}"`)
        res.json({
          success: false,
          message: "No metadata found in LaunchBox for this game",
        })
      }
    } catch (error) {
      console.error("Metadata fetch error:", (error as Error).message)
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Clean up invalid games (../ and ./ entries)
app.post("/api/cleanup", (_req: Request, res: Response): void => {
  try {
    const data = DB.load()
    const invalidFilenames = ["./", "../", ".", ".."]
    const beforeCount = data.games.length

    data.games = data.games.filter(
      (game) => !invalidFilenames.includes(game.filename),
    )

    const removedCount = beforeCount - data.games.length
    DB.save(data)

    res.json({
      success: true,
      message: `Removed ${removedCount} invalid entries`,
      removed: removedCount,
    })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

// API: Rebuild library – re-fetch game list from Myrient, preserve metadata &
// download status for games that still exist, remove stale entries, then
// scan the downloads folder to recover any files already on disk.
app.post(
  "/api/rebuild",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info("Rebuilding library")

      // 1. Fetch current game list from Myrient
      const remoteGames = await Myrient.fetchGames()
      const remoteKeys = new Set(remoteGames.map((game) => getGameKey(game)))

      const oldData = DB.load()
      const oldByGameKey = new Map(
        oldData.games.map((game) => [getGameKey(game), game]),
      )

      // 2. Build new game list: keep preserved fields for existing entries,
      //    create fresh entries for new ones.
      let nextId = oldData.games.reduce(
        (highestId, game) => Math.max(highestId, game.id),
        0,
      ) + 1
      const newGames: Game[] = []
      const addedGames: Game[] = []

      for (const remote of remoteGames) {
        const existing = oldByGameKey.get(getGameKey(remote))
        if (existing) {
          // Preserve metadata & download status, update size/date from remote
          newGames.push({
            ...existing,
            size: remote.size,
            date: remote.date,
            source_id: remote.source_id,
            source_url: remote.source_url,
            platform: remote.platform,
          })
        } else {
          const createdGame: Game = {
            id: nextId++,
            filename: remote.filename,
            name: cleanTheGamesDBGameName(remote.filename),
            size: remote.size,
            date: remote.date,
            source_id: remote.source_id,
            source_url: remote.source_url,
            platform: remote.platform,
            downloaded: 0,
            download_path: null,
            created_at: new Date().toISOString(),
            downloaded_at: null,
          }
          newGames.push(createdGame)
          addedGames.push(createdGame)
        }
      }

      // 3. Recover any file already on disk from the downloads index
      const reindexResult = reindexDownloadedGames({
        games: newGames,
        nextId,
      })
      const recoveredCount = reindexResult.reindexed

      const removedCount =
        oldData.games.length -
        oldData.games.filter((game) => remoteKeys.has(getGameKey(game))).length
      const addedCount = remoteGames.filter(
        (game) => !oldByGameKey.has(getGameKey(game)),
      ).length

      // 4. Save rebuilt database
      DB.save({ games: newGames, nextId })

      queueMetadataSync(addedGames)

      logger.info(
        `Rebuild complete: ${newGames.length} games, ` +
          `+${addedCount} new, -${removedCount} removed, ` +
          `${recoveredCount} recovered from disk`,
      )

      res.json({
        success: true,
        total: newGames.length,
        added: addedCount,
        removed: removedCount,
        recovered: recoveredCount,
        message:
          `Library rebuilt: ${newGames.length} games ` +
          `(+${addedCount} new, -${removedCount} removed, ` +
          `${recoveredCount} recovered from disk)`,
      })
    } catch (error) {
      console.error("Rebuild error:", (error as Error).message)
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Get LaunchBox metadata for a game (with TheGamesDB fallback)
app.post(
  "/api/launchbox-metadata",
  validateBody(requestSchemas.launchboxMetadata),
  async (req: Request, res: Response): Promise<void> => {
      const { gameName, platform } = req.body as {
        gameName: string
        platform?: string
      }

    try {
      if (!gameName) {
        res.status(400).json({ success: false, error: "Game name required" })
        return
      }

      // Try LaunchBox first
      const metadata = launchbox.getMetadata(gameName, platform)

      if (metadata) {
        res.json({ success: true, metadata, source: "launchbox" })
        return
      }

      // Fallback to TheGamesDB for metadata only (no image fetching)
      console.log(`LaunchBox not found for "${gameName}", trying TheGamesDB...`)
      const gdbGame = await thegamesdb.searchGame(gameName)

      if (gdbGame) {
        const gdbMetadata = await thegamesdb.getGameMetadata(gdbGame.id)

        if (gdbMetadata) {
          res.json({
            success: true,
            metadata: {
              name: gdbMetadata.name,
              releaseDate: gdbMetadata.releaseDate,
              overview: gdbMetadata.overview,
              developer: gdbMetadata.developer,
              publisher: gdbMetadata.publisher,
              genres: gdbMetadata.genres,
              rating: gdbMetadata.rating,
              gdbId: gdbGame.id,
            },
            source: "thegamesdb",
          })
          return
        }
      }

      res.json({
        success: false,
        message: "No metadata found in LaunchBox or TheGamesDB",
      })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.get(
  "/api/launchbox-search",
  validateQuery(requestSchemas.launchboxSearch),
  (req: Request, res: Response): void => {
  const query = (req.query.q as string) || ""
  const limit = parseInt((req.query.limit as string) || "10", 10)

  try {
    if (!query) {
      res.status(400).json({ success: false, error: "Search query required" })
      return
    }

    const results = launchbox.searchGames(query, limit)

    res.json({
      success: true,
      count: results.length,
      results,
    })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
},
)

// API: Get LaunchBox stats
app.get("/api/launchbox-stats", (_req: Request, res: Response): void => {
  res.json({
    success: true,
    gameCount: launchbox.getGameCount(),
    service: "LaunchBox Local Metadata",
    status: launchbox.getGameCount() > 0 ? "ready" : "no-data",
  })
})

// API: Download and cache game image
app.post(
  "/api/cache-image",
  validateBody(requestSchemas.cacheImage),
  async (req: Request, res: Response): Promise<void> => {
    const { gameName, imageUrl } = req.body as {
      gameName: string
      imageUrl: string
    }

    try {
      if (!gameName || !imageUrl) {
        res
          .status(400)
          .json({ success: false, error: "Game name and image URL required" })
        return
      }

      const cachedLocalPath = cachedImageUrlToFilePath(imageUrl)
      if (cachedLocalPath) {
        res.json({
          success: true,
          message: "Image is already cached locally",
          localPath: filePathToUrl(cachedLocalPath),
        })
        return
      }

      const localPath = await imageCache.downloadAndCache(gameName, imageUrl)

      if (localPath) {
        res.json({
          success: true,
          message: "Image cached successfully",
          localPath: filePathToUrl(localPath),
        })
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to cache image",
        })
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Get image cache stats
app.get("/api/image-cache-stats", (_req: Request, res: Response): void => {
  res.json({
    success: true,
    cacheSize: imageCache.getCacheSize(),
    unit: "MB",
    status: "ready",
  })
})

// API: Clear old cached images
app.post(
  "/api/clear-image-cache",
  validateBody(requestSchemas.clearImageCache),
  (req: Request, res: Response): void => {
  const days = (req.body.days as number) || 30

  try {
    const removed = imageCache.clearOldCache(days)
    res.json({
      success: true,
      removed,
      message: `Removed ${removed} old cached images`,
    })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
},
)

// API: TheGamesDB search fallback
app.get(
  "/api/thegamesdb-search",
  validateQuery(requestSchemas.thegamesdbSearch),
  async (req: Request, res: Response): Promise<void> => {
    const gameName = (req.query.name as string) || ""

    try {
      if (!gameName) {
        res.status(400).json({ success: false, error: "Game name required" })
        return
      }

      const game = await thegamesdb.searchGame(gameName)

      if (game) {
        const metadata = await thegamesdb.getGameMetadata(game.id)
        // Don't fetch box art automatically - let frontend request it on demand

        res.json({
          success: true,
          game,
          metadata,
          boxArt: null,
        })
      } else {
        res.json({ success: false, message: "Game not found in TheGamesDB" })
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Fetch box art from TheGamesDB on-demand
app.get(
  "/api/fetch-box-art",
  validateQuery(requestSchemas.fetchBoxArt),
  async (req: Request, res: Response): Promise<void> => {
    const gdbId = parseInt((req.query.gdbId as string) || "0", 10)
    const launchboxId = parseInt((req.query.launchboxId as string) || "0", 10)
    const gameName = (req.query.gameName as string) || ""

    try {
      if ((!gdbId && !launchboxId) || !gameName) {
        res
          .status(400)
          .json({
            success: false,
            error: "gameName and either gdbId or launchboxId are required",
          })
        return
      }

      let boxArtUrl: string | null = null
      let source = ""

      if (launchboxId) {
        boxArtUrl = await launchboxBoxArt.getBoxArt(launchboxId)
        source = "launchbox"
      }

      if (!boxArtUrl && gdbId) {
        boxArtUrl = await thegamesdb.getBoxArt(gdbId)
        source = "thegamesdb"
      }

      if (boxArtUrl) {
        const cachedImagePath = imageCache.getCachedImage(gameName, boxArtUrl)
        if (cachedImagePath) {
          console.log(`✓ Using cached box art for "${gameName}"`)
          res.json({
            success: true,
            boxArtUrl: filePathToUrl(cachedImagePath),
            cached: true,
            source,
          })
          return
        }

        const localPath = await imageCache.downloadAndCache(gameName, boxArtUrl)
        if (!localPath) {
          res.status(502).json({
            success: false,
            error: "Failed to cache remote box art",
          })
          return
        }

        res.json({
          success: true,
          boxArtUrl: filePathToUrl(localPath),
          cached: false,
          source,
        })
      } else {
        res.json({ success: false, message: "No box art found for this game" })
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Save box art to game record
app.post(
  "/api/save-box-art",
  validateBody(requestSchemas.saveBoxArt),
  async (req: Request, res: Response): Promise<void> => {
    const { gameId, boxArtPath } = req.body as {
      gameId: number
      boxArtPath: string
    }

    try {
      if (!gameId || !boxArtPath) {
        res.status(400).json({
          success: false,
          error: "Game ID and box art path required",
        })
        return
      }

      const game = DB.findById(gameId)
      if (!game) {
        res.status(404).json({ success: false, error: "Game not found" })
        return
      }

      const localBoxArtPath = cachedImageUrlToFilePath(boxArtPath)
      if (!localBoxArtPath) {
        res.status(400).json({
          success: false,
          error: "Box art must reference a cached local image",
        })
        return
      }

      DB.update(game.id, {
        box_art: localBoxArtPath,
      })

      res.json({
        success: true,
        message: "Box art saved to game record",
        boxArtUrl: filePathToUrl(localBoxArtPath),
      })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// API: Get metadata service stats
app.get("/api/metadata-stats", (_req: Request, res: Response): void => {
  const gdbStats = thegamesdb.getStats()

  res.json({
    success: true,
    launchbox: {
      gameCount: launchbox.getGameCount(),
      status: launchbox.getGameCount() > 0 ? "ready" : "no-data",
    },
    thegamesdb: {
      initialized: gdbStats.initialized,
      requestCount: gdbStats.requestCount,
      status: gdbStats.initialized ? "ready" : "unavailable",
    },
  })
})

app.get("/api/metadata-sync-status", (_req: Request, res: Response): void => {
  res.json({
    success: true,
    sync: metadataSyncState,
  })
})

app.get("/api/health", (_req: Request, res: Response): void => {
  res.json({
    success: true,
    status: Object.values(serviceStates).every((service) => service.status === "ready")
      ? "ready"
      : "degraded",
    services: serviceStates,
    queue: {
      processing: queueRuntime.processing,
      activeQueueId: queueRuntime.activeQueueId,
      activeGameId: queueRuntime.activeGameId,
      size: databaseService.listQueueItems().length,
    },
  })
})

app.get("/api/collections", (_req: Request, res: Response): void => {
  try {
    res.json({
      success: true,
      collections: databaseService.listCollections(),
    })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

app.post(
  "/api/collections",
  validateBody(requestSchemas.collectionCreate),
  (req: Request, res: Response): void => {
    try {
      const { name, description } = req.body as {
        name: string
        description?: string | null
      }
      const collection = databaseService.createCollection(
        name,
        description || null,
      )
      res.json({ success: true, collection })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.get(
  "/api/collections/:id/games",
  validateParams(requestSchemas.idParam),
  (req: Request, res: Response): void => {
    try {
      const collectionId = Number(req.params.id)
      res.json({
        success: true,
        games: databaseService.getCollectionGames(collectionId).map(toClientGame),
      })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.post(
  "/api/collections/:id/games",
  validateParams(requestSchemas.idParam),
  validateBody(requestSchemas.collectionGame),
  (req: Request, res: Response): void => {
    try {
      databaseService.addGameToCollection(Number(req.params.id), Number(req.body.gameId))
      res.json({ success: true, message: "Game added to collection" })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.delete(
  "/api/collections/:id/games/:gameId",
  validateParams(requestSchemas.collectionGameParams),
  (req: Request, res: Response): void => {
    try {
      databaseService.removeGameFromCollection(
        Number(req.params.id),
        Number(req.params.gameId),
      )
      res.json({ success: true, message: "Game removed from collection" })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.delete(
  "/api/collections/:id",
  validateParams(requestSchemas.idParam),
  (req: Request, res: Response): void => {
    try {
      databaseService.deleteCollection(Number(req.params.id))
      res.json({ success: true, message: "Collection deleted" })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.get("/api/queue", (_req: Request, res: Response): void => {
  try {
    res.json({
      success: true,
      queue: databaseService.listQueueItems().map((item) => ({
        ...item,
        game: item.game ? toClientGame(item.game) : null,
      })),
      runtime: {
        processing: queueRuntime.processing,
        activeQueueId: queueRuntime.activeQueueId,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

app.post(
  "/api/queue",
  validateBody(requestSchemas.queueItem),
  (req: Request, res: Response): void => {
    try {
      const queueItem = databaseService.enqueueGame(Number(req.body.gameId))
      void processDownloadQueue()
      res.json({ success: true, item: queueItem, message: "Game queued" })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.post(
  "/api/queue/:queueId/pause",
  validateParams(requestSchemas.queueIdParam),
  (req: Request, res: Response): void => {
    try {
      const queueId = Number(req.params.queueId)
      databaseService.updateQueueStatus(queueId, "paused")
      if (queueRuntime.activeQueueId === queueId && queueRuntime.controller) {
        queueRuntime.controller.abort()
      }
      res.json({ success: true, message: "Queue item paused" })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.post(
  "/api/queue/:queueId/resume",
  validateParams(requestSchemas.queueIdParam),
  (req: Request, res: Response): void => {
    try {
      const queueId = Number(req.params.queueId)
      databaseService.updateQueueStatus(queueId, "pending")
      void processDownloadQueue()
      res.json({ success: true, message: "Queue item resumed" })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

app.delete(
  "/api/queue/:queueId",
  validateParams(requestSchemas.queueIdParam),
  (req: Request, res: Response): void => {
    try {
      const queueId = Number(req.params.queueId)
      if (queueRuntime.activeQueueId === queueId && queueRuntime.controller) {
        databaseService.updateQueueStatus(queueId, "cancelled")
        queueRuntime.controller.abort()
      } else {
        databaseService.deleteQueueItem(queueId)
      }
      res.json({ success: true, message: "Queue item removed" })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  },
)

// Start server
app.listen(PORT, HOST, async () => {
  const initializeService = async (
    key: keyof typeof serviceStates,
    init: () => Promise<void>,
  ): Promise<void> => {
    try {
      await init()
      serviceStates[key] = { status: "ready" }
    } catch (error) {
      serviceStates[key] = {
        status: "degraded",
        detail: (error as Error).message,
      }
      logger.warn(`Service initialization degraded: ${key}`, (error as Error).message)
    }
  }

  await initializeService("launchbox", () => launchbox.initialize())
  await initializeService("imageCache", () => imageCache.initialize())
  await initializeService("thegamesdb", async () => {
    await thegamesdb.initialize()
    if (!thegamesdb.getStats().initialized) {
      throw new Error("TheGamesDB API key missing or service unavailable")
    }
  })

  logger.info(`Myrient-Get server running at http://${HOST}:${PORT}`)
  logger.info(`Downloads folder: ${DOWNLOADS_DIR}`)
  logger.info(
    `Myrient sources: ${MYRIENT_SOURCES.map((source) => source.label).join(", ")}`,
  )
  logger.info(
    `LaunchBox metadata: ${launchbox.getGameCount()} games across ${launchbox.getPlatformCount()} platforms`,
  )
  logger.info(
    `TheGamesDB fallback: ${serviceStates.thegamesdb.status === "ready" ? "Available" : "Degraded"}`,
  )
  logger.info(`Image cache: ${imageCache.getCacheSize().toFixed(1)} MB`)
})
