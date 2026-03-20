import * as fs from "fs"
import * as path from "path"
import BetterSqlite3 from "better-sqlite3"

interface ParsedMetadata {
  name: string
  databaseId?: number
  releaseYear?: string
  releaseDate?: string
  overview?: string
  developer?: string
  publisher?: string
  genres?: string
  rating?: number
  esrb?: string
}

interface CachedMetadataRow {
  import_id: string
  name: string
  exact_name_lower: string
  normalized_name: string
  platform_normalized: string
  platform_display: string
  database_id?: number | null
  release_year?: string | null
  release_date?: string | null
  overview?: string | null
  developer?: string | null
  publisher?: string | null
  genres?: string | null
  rating?: number | null
  esrb?: string | null
}

interface LaunchBoxCacheState {
  active_import_id: string | null
  source_mtime_ms: number | null
  source_size: number | null
  game_count: number
  platform_count: number
  cache_version: string | null
}

const DEFAULT_METADATA_DIR = path.join(
  __dirname,
  "..",
  "data",
  "launchbox-metadata",
)
const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "games.db")
const LAUNCHBOX_CACHE_VERSION = "3"

const ROMAN_NUMERAL_VALUES = new Map<string, number>([
  ["I", 1],
  ["II", 2],
  ["III", 3],
  ["IV", 4],
  ["V", 5],
  ["VI", 6],
  ["VII", 7],
  ["VIII", 8],
  ["IX", 9],
  ["X", 10],
  ["XI", 11],
  ["XII", 12],
  ["XIII", 13],
  ["XIV", 14],
  ["XV", 15],
  ["XVI", 16],
  ["XVII", 17],
  ["XVIII", 18],
  ["XIX", 19],
  ["XX", 20],
])

const PLATFORM_ALIASES = new Map<string, string>([
  ["game boy advance", "nintendo game boy advance"],
  ["gba", "nintendo game boy advance"],
  ["nintendo gba", "nintendo game boy advance"],
  ["nes", "nintendo entertainment system"],
  ["snes", "super nintendo entertainment system"],
  ["ps1", "sony playstation"],
  ["playstation", "sony playstation"],
  ["sony playstation", "sony playstation"],
  ["ps2", "sony playstation 2"],
  ["playstation 2", "sony playstation 2"],
  ["psp", "sony playstation portable"],
  ["playstation portable", "sony playstation portable"],
  ["sony psp", "sony playstation portable"],
])

/**
 * LaunchBox Metadata Service
 * Imports LaunchBox XML into SQLite for multi-platform lookups.
 */
export class LaunchBoxService {
  private metadataPath: string
  private db: BetterSqlite3.Database
  private statements = new Map<string, BetterSqlite3.Statement>()
  private initialized = false
  private gameCount = 0
  private platformCount = 0
  private activeImportId: string | null = null

  constructor(
    dataDir: string = DEFAULT_METADATA_DIR,
    dbPath: string = DEFAULT_DB_PATH,
  ) {
    this.metadataPath = dataDir
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma("journal_mode = WAL")
    this.db.pragma("synchronous = NORMAL")
    this.initializeSchema()
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS launchbox_metadata (
        import_id TEXT NOT NULL,
        name TEXT NOT NULL,
        exact_name_lower TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        platform_normalized TEXT NOT NULL,
        platform_display TEXT NOT NULL,
        database_id INTEGER,
        release_year TEXT,
        release_date TEXT,
        overview TEXT,
        developer TEXT,
        publisher TEXT,
        genres TEXT,
        rating REAL,
        esrb TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_launchbox_exact_lookup
        ON launchbox_metadata (import_id, platform_normalized, exact_name_lower);
      CREATE INDEX IF NOT EXISTS idx_launchbox_normalized_lookup
        ON launchbox_metadata (import_id, platform_normalized, normalized_name);
      CREATE INDEX IF NOT EXISTS idx_launchbox_global_exact_lookup
        ON launchbox_metadata (import_id, exact_name_lower);
      CREATE INDEX IF NOT EXISTS idx_launchbox_global_normalized_lookup
        ON launchbox_metadata (import_id, normalized_name);
      CREATE INDEX IF NOT EXISTS idx_launchbox_search_lookup
        ON launchbox_metadata (import_id, platform_normalized, name);

      CREATE TABLE IF NOT EXISTS launchbox_metadata_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_import_id TEXT,
        source_mtime_ms INTEGER,
        source_size INTEGER,
        game_count INTEGER NOT NULL DEFAULT 0,
        platform_count INTEGER NOT NULL DEFAULT 0,
        cache_version TEXT,
        indexed_at TEXT
      );
    `)

    const stateColumns = this.db
      .prepare("PRAGMA table_info(launchbox_metadata_state)")
      .all() as Array<{ name: string }>
    if (!stateColumns.some((column) => column.name === "cache_version")) {
      this.db.exec(
        "ALTER TABLE launchbox_metadata_state ADD COLUMN cache_version TEXT",
      )
    }
  }

  private prepare(sql: string): BetterSqlite3.Statement {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, this.db.prepare(sql))
    }
    return this.statements.get(sql)!
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    let pendingImportId: string | null = null

    try {
      const metadataFile = path.join(this.metadataPath, "Metadata.xml")

      if (!fs.existsSync(metadataFile)) {
        console.warn("LaunchBox Metadata.xml not found at:", metadataFile)
        this.initialized = true
        return
      }

      const fileStats = fs.statSync(metadataFile)
      const cacheState = this.getCacheState()

      if (
        cacheState?.active_import_id &&
        cacheState.source_mtime_ms === fileStats.mtimeMs &&
        cacheState.source_size === fileStats.size &&
        cacheState.cache_version === LAUNCHBOX_CACHE_VERSION &&
        this.hasImportRows(cacheState.active_import_id)
      ) {
        this.activeImportId = cacheState.active_import_id
        this.gameCount = cacheState.game_count
        this.platformCount = cacheState.platform_count
        console.log(
          `✓ LaunchBox loaded ${this.gameCount} cached games across ${this.platformCount} platforms`,
        )
        this.initialized = true
        return
      }

      console.log("Loading LaunchBox metadata into SQLite cache...")
      console.log(`  File size: ${(fileStats.size / 1024 / 1024).toFixed(1)} MB`)

      const fileContent = fs.readFileSync(metadataFile, "utf-8")
      const gameRegex = /<Game>([\s\S]*?)<\/Game>/g
      const insertStatement = this.prepare(`
        INSERT INTO launchbox_metadata (
          import_id, name, exact_name_lower, normalized_name,
          platform_normalized, platform_display, database_id,
          release_year, release_date, overview, developer,
          publisher, genres, rating, esrb
        ) VALUES (
          @import_id, @name, @exact_name_lower, @normalized_name,
          @platform_normalized, @platform_display, @databaseId,
          @releaseYear, @releaseDate, @overview, @developer,
          @publisher, @genres, @rating, @esrb
        )
      `)
      const insertBatch = this.db.transaction((rows: CachedMetadataRow[]) => {
        for (const row of rows) {
          insertStatement.run({
            ...row,
            databaseId: row.database_id ?? null,
            releaseYear: row.release_year ?? null,
            releaseDate: row.release_date ?? null,
            overview: row.overview ?? null,
            developer: row.developer ?? null,
            publisher: row.publisher ?? null,
            genres: row.genres ?? null,
            rating: row.rating ?? null,
            esrb: row.esrb ?? null,
          })
        }
      })

      pendingImportId = new Date().toISOString()
      let processedCount = 0
      let importedCount = 0
      const platforms = new Set<string>()
      let batch: CachedMetadataRow[] = []
      let match: RegExpExecArray | null

      while ((match = gameRegex.exec(fileContent)) !== null) {
        processedCount++
        const gameXml = match[1]
        const name = this.extractField(gameXml, "Name")
        const platform = this.extractField(gameXml, "Platform")

        if (!name || !platform) {
          continue
        }

        const platformNormalized = this.normalizePlatform(platform)
        const metadata: CachedMetadataRow = {
          import_id: pendingImportId,
          name,
          exact_name_lower: name.toLowerCase().trim(),
          normalized_name: this.normalizeGameName(name).toLowerCase(),
          platform_normalized: platformNormalized,
          platform_display: platform.trim(),
          database_id:
            parseInt(this.extractField(gameXml, "DatabaseID") || "0", 10) ||
            undefined,
          release_year: this.extractField(gameXml, "ReleaseYear"),
          release_date: this.extractField(gameXml, "ReleaseDate"),
          overview: this.extractField(gameXml, "Overview"),
          developer: this.extractField(gameXml, "Developer"),
          publisher: this.extractField(gameXml, "Publisher"),
          genres: this.extractField(gameXml, "Genres"),
          esrb: this.extractField(gameXml, "ESRB"),
          rating: undefined,
        }

        const ratingStr = this.extractField(gameXml, "CommunityRating")
        if (ratingStr) {
          const parsedRating = parseFloat(ratingStr)
          if (!Number.isNaN(parsedRating)) {
            metadata.rating = parsedRating
          }
        }

        batch.push(metadata)
        importedCount++
        platforms.add(platformNormalized)

        if (batch.length >= 1000) {
          insertBatch(batch)
          batch = []
        }

        if (processedCount % 5000 === 0) {
          console.log(
            `  Processed ${processedCount} games, cached ${importedCount} metadata records...`,
          )
        }
      }

      if (batch.length > 0) {
        insertBatch(batch)
      }

      this.db.transaction(() => {
        this.prepare(`
          INSERT INTO launchbox_metadata_state (
            id, active_import_id, source_mtime_ms, source_size,
            game_count, platform_count, cache_version, indexed_at
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            active_import_id = excluded.active_import_id,
            source_mtime_ms = excluded.source_mtime_ms,
            source_size = excluded.source_size,
            game_count = excluded.game_count,
            platform_count = excluded.platform_count,
            cache_version = excluded.cache_version,
            indexed_at = excluded.indexed_at
        `).run(
          pendingImportId,
          fileStats.mtimeMs,
          fileStats.size,
          importedCount,
          platforms.size,
          LAUNCHBOX_CACHE_VERSION,
          new Date().toISOString(),
        )

        this.prepare(
          "DELETE FROM launchbox_metadata WHERE import_id <> ?",
        ).run(pendingImportId)
      })()

      this.activeImportId = pendingImportId
      this.gameCount = importedCount
      this.platformCount = platforms.size

      console.log(
        `✓ LaunchBox indexed ${this.gameCount} games across ${this.platformCount} platforms`,
      )
      this.initialized = true
    } catch (error) {
      if (pendingImportId) {
        this.prepare("DELETE FROM launchbox_metadata WHERE import_id = ?").run(
          pendingImportId,
        )
      }
      console.error(
        "Error loading LaunchBox metadata:",
        (error as Error).message,
      )
      this.initialized = true
    }
  }

  private getCacheState(): LaunchBoxCacheState | null {
    const row = this.prepare(`
      SELECT
        active_import_id,
        source_mtime_ms,
        source_size,
        game_count,
        platform_count,
        cache_version
      FROM launchbox_metadata_state
      WHERE id = 1
      LIMIT 1
    `).get() as LaunchBoxCacheState | undefined

    return row || null
  }

  private hasImportRows(importId: string): boolean {
    const row = this.prepare(`
      SELECT COUNT(*) AS count
      FROM launchbox_metadata
      WHERE import_id = ?
    `).get(importId) as { count: number }
    return Number(row.count) > 0
  }

  private extractField(gameXml: string, fieldName: string): string | undefined {
    const regex = new RegExp(`<${fieldName}>([\\s\\S]*?)<\\/${fieldName}>`)
    const match = gameXml.match(regex)
    if (!match) {
      return undefined
    }

    return this.decodeXmlEntities(match[1]).trim() || undefined
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }

  getMetadata(gameName: string, platform?: string): ParsedMetadata | null {
    if (!this.initialized || !this.activeImportId) {
      console.warn("LaunchBox service not initialized")
      return null
    }

    const searchNames = [
      gameName,
      this.normalizeGameName(gameName),
      this.normalizeGameName(gameName).split(/\s+\(/)[0],
      gameName.replace(/\.(zip|7z|rom|gba|iso|z64|n64|v64|nds|3ds|cia|xci)$/i, ""),
    ]
      .map((name) => name.toLowerCase().trim())
      .filter(Boolean)

    const platformSearchOrder = this.getPlatformSearchOrder(platform)

    for (const platformKey of platformSearchOrder) {
      for (const searchName of searchNames) {
        const exact = this.findExactMetadata(searchName, platformKey)
        if (exact) {
          return exact
        }

        const normalized = this.normalizeGameName(searchName).toLowerCase()
        const normalizedMatch = this.findNormalizedMetadata(
          normalized,
          platformKey,
        )
        if (normalizedMatch) {
          return normalizedMatch
        }

        const candidates = this.findCandidateMetadata(normalized, platformKey, 25)
        for (const candidate of candidates) {
          if (
            this.isSimilar(normalized, candidate.normalized_name, 0.6) ||
            this.isSimilar(searchName, candidate.exact_name_lower, 0.6)
          ) {
            return this.toParsedMetadata(candidate)
          }
        }
      }
    }

    return null
  }

  searchGames(query: string, limit: number = 10, platform?: string): ParsedMetadata[] {
    if (!this.initialized || !this.activeImportId) {
      return []
    }

    const normalized = this.normalizeGameName(query).toLowerCase()
    if (!normalized) {
      return []
    }

    const platformKey = platform ? this.normalizePlatform(platform) : null
    const rows = platformKey
      ? (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND platform_normalized = ?
            AND (normalized_name LIKE ? OR exact_name_lower LIKE ?)
          ORDER BY name COLLATE NOCASE
          LIMIT ?
        `).all(
          this.activeImportId,
          platformKey,
          `%${normalized}%`,
          `%${normalized}%`,
          limit,
        ) as CachedMetadataRow[])
      : (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND (normalized_name LIKE ? OR exact_name_lower LIKE ?)
          ORDER BY name COLLATE NOCASE
          LIMIT ?
        `).all(
          this.activeImportId,
          `%${normalized}%`,
          `%${normalized}%`,
          limit,
        ) as CachedMetadataRow[])

    return rows.map((row) => this.toParsedMetadata(row))
  }

  getGameCount(): number {
    return this.gameCount
  }

  getPlatformCount(): number {
    return this.platformCount
  }

  private getPlatformSearchOrder(platform?: string): Array<string | null> {
    const normalizedPlatform = platform ? this.normalizePlatform(platform) : null
    return normalizedPlatform ? [normalizedPlatform, null] : [null]
  }

  private findExactMetadata(
    exactNameLower: string,
    platformKey: string | null,
  ): ParsedMetadata | null {
    if (!this.activeImportId) {
      return null
    }

    const row = platformKey
      ? (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND platform_normalized = ?
            AND exact_name_lower = ?
          LIMIT 1
        `).get(
          this.activeImportId,
          platformKey,
          exactNameLower,
        ) as CachedMetadataRow | undefined)
      : (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND exact_name_lower = ?
          LIMIT 1
        `).get(this.activeImportId, exactNameLower) as CachedMetadataRow | undefined)

    return row ? this.toParsedMetadata(row) : null
  }

  private findNormalizedMetadata(
    normalizedName: string,
    platformKey: string | null,
  ): ParsedMetadata | null {
    if (!this.activeImportId) {
      return null
    }

    const row = platformKey
      ? (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND platform_normalized = ?
            AND normalized_name = ?
          LIMIT 1
        `).get(
          this.activeImportId,
          platformKey,
          normalizedName,
        ) as CachedMetadataRow | undefined)
      : (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND normalized_name = ?
          LIMIT 1
        `).get(this.activeImportId, normalizedName) as CachedMetadataRow | undefined)

    return row ? this.toParsedMetadata(row) : null
  }

  private findCandidateMetadata(
    normalizedName: string,
    platformKey: string | null,
    limit: number,
  ): CachedMetadataRow[] {
    if (!this.activeImportId || !normalizedName) {
      return []
    }

    const likeTerm = `%${normalizedName}%`
    return platformKey
      ? (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND platform_normalized = ?
            AND (normalized_name LIKE ? OR exact_name_lower LIKE ?)
          ORDER BY LENGTH(normalized_name) ASC
          LIMIT ?
        `).all(
          this.activeImportId,
          platformKey,
          likeTerm,
          likeTerm,
          limit,
        ) as CachedMetadataRow[])
      : (this.prepare(`
          SELECT
            import_id, name, exact_name_lower, normalized_name,
            platform_normalized, platform_display, database_id,
            release_year, release_date, overview, developer,
            publisher, genres, rating, esrb
          FROM launchbox_metadata
          WHERE import_id = ?
            AND (normalized_name LIKE ? OR exact_name_lower LIKE ?)
          ORDER BY LENGTH(normalized_name) ASC
          LIMIT ?
        `).all(
          this.activeImportId,
          likeTerm,
          likeTerm,
          limit,
        ) as CachedMetadataRow[])
  }

  private toParsedMetadata(row: CachedMetadataRow): ParsedMetadata {
    return {
      name: row.name,
      databaseId: row.database_id ?? undefined,
      releaseYear: row.release_year ?? undefined,
      releaseDate: row.release_date ?? undefined,
      overview: row.overview ?? undefined,
      developer: row.developer ?? undefined,
      publisher: row.publisher ?? undefined,
      genres: row.genres ?? undefined,
      rating: row.rating ?? undefined,
      esrb: row.esrb ?? undefined,
    }
  }

  private isSimilar(
    str1: string,
    str2: string,
    threshold: number = 0.8,
  ): boolean {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) {
      return true
    }

    const editDistance = this.levenshteinDistance(longer, shorter)
    const similarity = 1.0 - editDistance / longer.length

    return similarity >= threshold
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = []
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j
        } else if (j > 0) {
          let newValue = costs[j - 1]
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
          }
          costs[j - 1] = lastValue
          lastValue = newValue
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue
      }
    }
    return costs[s2.length]
  }

  private normalizeGameName(name: string): string {
    const trimmed = name.trim()
    const articleReordered = trimmed.replace(
      /^(.+),\s*(the|a|an)$/i,
      (_match, title: string, article: string) =>
        `${article.charAt(0).toUpperCase()}${article.slice(1).toLowerCase()} ${title}`,
    )

    return articleReordered
      .replace(/\.(zip|7z|rom|gba|iso|z64|n64|v64|nds|3ds|cia|xci)$/i, "")
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/[’`]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s*&\s*/g, " and ")
      .replace(/\b([ivxlcdm]+)\b/gi, (match) => {
        const converted = ROMAN_NUMERAL_VALUES.get(match.toUpperCase())
        return converted ? String(converted) : match
      })
      .replace(/['"]/g, "")
      .replace(/[,:;.!?]/g, " ")
      .replace(/\s*[-/]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  private normalizePlatform(platform: string): string {
    const normalized = platform
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    return PLATFORM_ALIASES.get(normalized) || normalized
  }
}

let launchboxServiceInstance: LaunchBoxService | null = null

export function getLaunchBoxService(dataDir?: string): LaunchBoxService {
  if (!launchboxServiceInstance) {
    launchboxServiceInstance = new LaunchBoxService(dataDir)
  }
  return launchboxServiceInstance
}
