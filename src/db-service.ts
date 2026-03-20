import * as fs from "fs"
import * as path from "path"
import BetterSqlite3 from "better-sqlite3"
import {
  Collection,
  Game,
  GameData,
  GameInput,
  QueueItem,
  QueueStatus,
  StoredGameRecord,
} from "./app-types"
import { logger } from "./logger"
import { getMyrientSource } from "./myrient-sources"

type PersistedGameRecord = StoredGameRecord

function normalizeStoredGame(game: StoredGameRecord): Game {
  const source = getMyrientSource(game.source_id, game.source_url)

  return {
    ...game,
    source_id: source.id,
    source_url: source.baseURL,
    platform: game.platform || source.platform,
    downloaded: game.downloaded === 1 ? 1 : 0,
    download_path: game.download_path || null,
    downloaded_at: game.downloaded_at || null,
    gdb_id: game.gdb_id ?? undefined,
    box_art: game.box_art ?? undefined,
    release_date: game.release_date ?? undefined,
    developer: game.developer ?? undefined,
    publisher: game.publisher ?? undefined,
    description: game.description ?? undefined,
  }
}

export class DatabaseService {
  private db: BetterSqlite3.Database
  private statements = new Map<string, BetterSqlite3.Statement>()

  constructor(private dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma("journal_mode = WAL")
    this.db.pragma("synchronous = NORMAL")
    this.initialize()
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY,
        filename TEXT NOT NULL,
        name TEXT NOT NULL,
        size TEXT NOT NULL,
        date TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        platform TEXT NOT NULL,
        downloaded INTEGER NOT NULL DEFAULT 0,
        download_path TEXT,
        created_at TEXT NOT NULL,
        downloaded_at TEXT,
        gdb_id INTEGER,
        box_art TEXT,
        release_date TEXT,
        developer TEXT,
        publisher TEXT,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS collection_games (
        collection_id INTEGER NOT NULL,
        game_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (collection_id, game_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS download_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_download_queue_status
        ON download_queue (status, updated_at, id);
    `)

    this.ensureGameColumn("downloaded_at", "TEXT")
    this.ensureGameColumn("gdb_id", "INTEGER")
    this.ensureGameColumn("box_art", "TEXT")
    this.ensureGameColumn("release_date", "TEXT")
    this.ensureGameColumn("developer", "TEXT")
    this.ensureGameColumn("publisher", "TEXT")
    this.ensureGameColumn("description", "TEXT")

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_games_source_filename
        ON games (source_id, filename);
      CREATE INDEX IF NOT EXISTS idx_games_name ON games (name);
      CREATE INDEX IF NOT EXISTS idx_games_downloaded ON games (downloaded);
      CREATE INDEX IF NOT EXISTS idx_games_downloaded_at ON games (downloaded_at);
      CREATE INDEX IF NOT EXISTS idx_games_platform ON games (platform);
    `)

    logger.info(`Connected to SQLite database at ${this.dbPath}`)
  }

  private ensureGameColumn(columnName: string, columnType: string): void {
    const columns = this.db
      .prepare("PRAGMA table_info(games)")
      .all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === columnName)) {
      this.db.exec(`ALTER TABLE games ADD COLUMN ${columnName} ${columnType}`)
    }
  }

  private prepare(sql: string): BetterSqlite3.Statement {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, this.db.prepare(sql))
    }
    return this.statements.get(sql)!
  }

  private mapGameRow(row: PersistedGameRecord | undefined): Game | undefined {
    return row ? normalizeStoredGame(row) : undefined
  }

  private saveGame(game: Game): void {
    this.prepare(`
      INSERT OR REPLACE INTO games (
        id, filename, name, size, date,
        source_id, source_url, platform,
        downloaded, download_path, created_at, downloaded_at,
        gdb_id, box_art, release_date, developer, publisher, description
      ) VALUES (
        @id, @filename, @name, @size, @date,
        @source_id, @source_url, @platform,
        @downloaded, @download_path, @created_at, @downloaded_at,
        @gdb_id, @box_art, @release_date, @developer, @publisher, @description
      )
    `).run({
      ...game,
      gdb_id: game.gdb_id ?? null,
      box_art: game.box_art ?? null,
      release_date: game.release_date ?? null,
      developer: game.developer ?? null,
      publisher: game.publisher ?? null,
      description: game.description ?? null,
      downloaded_at: game.downloaded_at ?? null,
      download_path: game.download_path ?? null,
    })
  }

  load(): GameData {
    const games = this.getAllGames()
    return {
      games,
      nextId:
        games.reduce((highest, game) => Math.max(highest, game.id), 0) + 1,
    }
  }

  replaceAllGames(games: Game[]): void {
    const tx = this.db.transaction((records: Game[]) => {
      this.prepare("DELETE FROM games").run()
      for (const game of records) {
        this.saveGame(game)
      }
    })
    tx(games)
  }

  getAllGames(): Game[] {
    const rows = this.prepare(`
      SELECT
        id, filename, name, size, date,
        source_id, source_url, platform,
        downloaded, download_path, created_at, downloaded_at,
        gdb_id, box_art, release_date, developer, publisher, description
      FROM games
      ORDER BY id
    `).all() as PersistedGameRecord[]
    return rows.map(normalizeStoredGame)
  }

  getDownloadedGames(): Game[] {
    const rows = this.prepare(`
      SELECT
        id, filename, name, size, date,
        source_id, source_url, platform,
        downloaded, download_path, created_at, downloaded_at,
        gdb_id, box_art, release_date, developer, publisher, description
      FROM games
      WHERE downloaded = 1
      ORDER BY name COLLATE NOCASE
    `).all() as PersistedGameRecord[]
    return rows.map(normalizeStoredGame)
  }

  getRecentDownloaded(limit: number = 10): Game[] {
    const rows = this.prepare(`
      SELECT
        id, filename, name, size, date,
        source_id, source_url, platform,
        downloaded, download_path, created_at, downloaded_at,
        gdb_id, box_art, release_date, developer, publisher, description
      FROM games
      WHERE downloaded = 1
      ORDER BY COALESCE(downloaded_at, created_at) DESC
      LIMIT ?
    `).all(limit) as PersistedGameRecord[]
    return rows.map(normalizeStoredGame)
  }

  findGameById(id: number): Game | undefined {
    const row = this.prepare(`
      SELECT
        id, filename, name, size, date,
        source_id, source_url, platform,
        downloaded, download_path, created_at, downloaded_at,
        gdb_id, box_art, release_date, developer, publisher, description
      FROM games
      WHERE id = ?
      LIMIT 1
    `).get(id) as PersistedGameRecord | undefined
    return this.mapGameRow(row)
  }

  findGameByFilename(filename: string, sourceId?: string): Game | undefined {
    const row = sourceId
      ? (this.prepare(`
          SELECT
            id, filename, name, size, date,
            source_id, source_url, platform,
            downloaded, download_path, created_at, downloaded_at,
            gdb_id, box_art, release_date, developer, publisher, description
          FROM games
          WHERE filename = ? AND source_id = ?
          LIMIT 1
        `).get(filename, sourceId) as PersistedGameRecord | undefined)
      : (this.prepare(`
          SELECT
            id, filename, name, size, date,
            source_id, source_url, platform,
            downloaded, download_path, created_at, downloaded_at,
            gdb_id, box_art, release_date, developer, publisher, description
          FROM games
          WHERE filename = ?
          LIMIT 1
        `).get(filename) as PersistedGameRecord | undefined)
    return this.mapGameRow(row)
  }

  addGame(game: GameInput): Game {
    const newGame: Game = normalizeStoredGame({
      id: this.getNextGameId(),
      filename: game.filename,
      name: game.name,
      size: game.size,
      date: game.date,
      source_id: game.source_id,
      source_url: game.source_url,
      platform: game.platform,
      downloaded: game.downloaded ?? 0,
      download_path: game.download_path ?? null,
      created_at: game.created_at || new Date().toISOString(),
      downloaded_at: null,
    })
    this.saveGame(newGame)
    return newGame
  }

  updateGame(id: number, updates: Partial<Game>): Game | undefined {
    const existing = this.findGameById(id)
    if (!existing) {
      return undefined
    }
    const merged = normalizeStoredGame({
      ...existing,
      ...updates,
      id,
    })
    this.saveGame(merged)
    return merged
  }

  deleteGame(id: number): void {
    this.prepare("DELETE FROM games WHERE id = ?").run(id)
  }

  removeInvalidEntries(): number {
    const invalidFilenames = ["./", "../", ".", ".."]
    const before = Number(
      (this.prepare("SELECT COUNT(*) AS count FROM games").get() as { count: number })
        .count,
    )
    this.prepare(
      `DELETE FROM games WHERE filename IN (${invalidFilenames.map(() => "?").join(",")})`,
    ).run(...invalidFilenames)
    const after = Number(
      (this.prepare("SELECT COUNT(*) AS count FROM games").get() as { count: number })
        .count,
    )
    return before - after
  }

  getStats(): { total_games: number; downloaded_count: number } {
    const row = this.prepare(`
      SELECT
        COUNT(*) AS total_games,
        SUM(CASE WHEN downloaded = 1 THEN 1 ELSE 0 END) AS downloaded_count
      FROM games
    `).get() as { total_games: number; downloaded_count: number | null }
    return {
      total_games: Number(row.total_games || 0),
      downloaded_count: Number(row.downloaded_count || 0),
    }
  }

  private getNextGameId(): number {
    return Number(
      (this.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM games").get() as {
        nextId: number
      }).nextId,
    )
  }

  listCollections(): Collection[] {
    return this.prepare(`
      SELECT
        c.id,
        c.name,
        c.description,
        c.created_at,
        COUNT(cg.game_id) AS game_count
      FROM collections c
      LEFT JOIN collection_games cg ON cg.collection_id = c.id
      GROUP BY c.id, c.name, c.description, c.created_at
      ORDER BY c.name COLLATE NOCASE
    `).all() as Collection[]
  }

  createCollection(name: string, description: string | null): Collection {
    const createdAt = new Date().toISOString()
    const info = this.prepare(
      "INSERT INTO collections (name, description, created_at) VALUES (?, ?, ?)",
    ).run(name, description, createdAt)
    return {
      id: Number(info.lastInsertRowid),
      name,
      description,
      created_at: createdAt,
      game_count: 0,
    }
  }

  deleteCollection(id: number): void {
    this.prepare("DELETE FROM collections WHERE id = ?").run(id)
  }

  addGameToCollection(collectionId: number, gameId: number): void {
    this.prepare(
      "INSERT OR IGNORE INTO collection_games (collection_id, game_id, created_at) VALUES (?, ?, ?)",
    ).run(collectionId, gameId, new Date().toISOString())
  }

  removeGameFromCollection(collectionId: number, gameId: number): void {
    this.prepare(
      "DELETE FROM collection_games WHERE collection_id = ? AND game_id = ?",
    ).run(collectionId, gameId)
  }

  getCollectionGames(collectionId: number): Game[] {
    const rows = this.prepare(`
      SELECT
        g.id, g.filename, g.name, g.size, g.date,
        g.source_id, g.source_url, g.platform,
        g.downloaded, g.download_path, g.created_at, g.downloaded_at,
        g.gdb_id, g.box_art, g.release_date, g.developer, g.publisher, g.description
      FROM collection_games cg
      INNER JOIN games g ON g.id = cg.game_id
      WHERE cg.collection_id = ?
      ORDER BY g.name COLLATE NOCASE
    `).all(collectionId) as PersistedGameRecord[]
    return rows.map(normalizeStoredGame)
  }

  listQueueItems(): QueueItem[] {
    const rows = this.prepare(`
      SELECT
        q.id,
        q.game_id,
        q.status,
        q.error,
        q.attempts,
        q.created_at,
        q.updated_at,
        g.id AS g_id,
        g.filename AS g_filename,
        g.name AS g_name,
        g.size AS g_size,
        g.date AS g_date,
        g.source_id AS g_source_id,
        g.source_url AS g_source_url,
        g.platform AS g_platform,
        g.downloaded AS g_downloaded,
        g.download_path AS g_download_path,
        g.created_at AS g_created_at,
        g.downloaded_at AS g_downloaded_at,
        g.gdb_id AS g_gdb_id,
        g.box_art AS g_box_art,
        g.release_date AS g_release_date,
        g.developer AS g_developer,
        g.publisher AS g_publisher,
        g.description AS g_description
      FROM download_queue q
      INNER JOIN games g ON g.id = q.game_id
      ORDER BY CASE q.status
        WHEN 'downloading' THEN 0
        WHEN 'pending' THEN 1
        WHEN 'paused' THEN 2
        WHEN 'failed' THEN 3
        ELSE 4
      END, q.created_at ASC
    `).all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row.id),
      game_id: Number(row.game_id),
      status: row.status as QueueStatus,
      error: (row.error as string | null) || null,
      attempts: Number(row.attempts),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      game: normalizeStoredGame({
        id: Number(row.g_id),
        filename: String(row.g_filename),
        name: String(row.g_name),
        size: String(row.g_size),
        date: String(row.g_date),
        source_id: String(row.g_source_id),
        source_url: String(row.g_source_url),
        platform: String(row.g_platform),
        downloaded: Number(row.g_downloaded) === 1 ? 1 : 0,
        download_path: (row.g_download_path as string | null) || null,
        created_at: String(row.g_created_at),
        downloaded_at: (row.g_downloaded_at as string | null) || null,
        gdb_id: row.g_gdb_id as number | undefined,
        box_art: row.g_box_art as string | undefined,
        release_date: row.g_release_date as string | undefined,
        developer: row.g_developer as string | undefined,
        publisher: row.g_publisher as string | undefined,
        description: row.g_description as string | undefined,
      }),
    }))
  }

  enqueueGame(gameId: number): QueueItem {
    const existing = this.prepare(
      "SELECT id, status FROM download_queue WHERE game_id = ? LIMIT 1",
    ).get(gameId) as { id: number; status: QueueStatus } | undefined
    const timestamp = new Date().toISOString()

    if (existing) {
      this.prepare(
        "UPDATE download_queue SET status = 'pending', error = NULL, updated_at = ? WHERE id = ?",
      ).run(timestamp, existing.id)
    } else {
      this.prepare(
        "INSERT INTO download_queue (game_id, status, error, attempts, created_at, updated_at) VALUES (?, 'pending', NULL, 0, ?, ?)",
      ).run(gameId, timestamp, timestamp)
    }

    return this.listQueueItems().find((item) => item.game_id === gameId)!
  }

  getQueueItem(queueId: number): QueueItem | undefined {
    return this.listQueueItems().find((item) => item.id === queueId)
  }

  updateQueueStatus(
    queueId: number,
    status: QueueStatus,
    error: string | null = null,
    incrementAttempts: boolean = false,
  ): void {
    this.prepare(`
      UPDATE download_queue
      SET status = ?,
          error = ?,
          attempts = attempts + ?,
          updated_at = ?
      WHERE id = ?
    `).run(status, error, incrementAttempts ? 1 : 0, new Date().toISOString(), queueId)
  }

  deleteQueueItem(queueId: number): void {
    this.prepare("DELETE FROM download_queue WHERE id = ?").run(queueId)
  }

  getNextPendingQueueItem(): QueueItem | undefined {
    const row = this.prepare(`
      SELECT id
      FROM download_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `).get() as { id: number } | undefined
    return row ? this.getQueueItem(Number(row.id)) : undefined
  }
}

let databaseServiceInstance: DatabaseService | null = null

export function getDatabaseService(dbPath: string): DatabaseService {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService(dbPath)
  }
  return databaseServiceInstance
}
