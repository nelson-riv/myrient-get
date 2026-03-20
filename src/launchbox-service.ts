import * as fs from "fs"
import * as path from "path"

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

/**
 * LaunchBox Metadata Service
 * Uses regex-based parsing for efficient metadata extraction from large XML files
 */
export class LaunchBoxService {
  private metadataPath: string
  private metadataIndex: Map<string, ParsedMetadata> = new Map()
  private initialized = false

  constructor(
    dataDir: string = path.join(__dirname, "..", "data", "launchbox-metadata"),
  ) {
    this.metadataPath = dataDir
  }

  /**
   * Initialize the service by loading and indexing metadata
   * Uses fast regex-based parsing for large XML files
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      const metadataFile = path.join(this.metadataPath, "Metadata.xml")

      if (!fs.existsSync(metadataFile)) {
        console.warn("LaunchBox Metadata.xml not found at:", metadataFile)
        this.initialized = true
        return
      }

      console.log("Loading LaunchBox metadata (fast mode)...")
      const stats = fs.statSync(metadataFile)
      console.log(`  File size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`)

      console.log("Indexing GBA games...")

      // Use fast regex-based parsing instead of XML parser
      const fileContent = fs.readFileSync(metadataFile, "utf-8")

      // Find all Game entries
      const gameRegex = /<Game>([\s\S]*?)<\/Game>/g
      let match
      let gbaCount = 0
      let processedCount = 0

      while ((match = gameRegex.exec(fileContent)) !== null) {
        processedCount++
        const gameXml = match[1]

        // Check if this is a GBA game
        if (!gameXml.includes("Game Boy Advance")) {
          continue
        }

        // Extract game data using regex
        const nameMatch = gameXml.match(/<Name>([^<]+)<\/Name>/)
        const platformMatch = gameXml.match(/<Platform>([^<]+)<\/Platform>/)

        if (!nameMatch || !platformMatch) continue

        const name = nameMatch[1]
        const platform = platformMatch[1]

        // Verify it's GBA
        if (
          !platform.includes("Game Boy Advance") &&
          !platform.includes("Nintendo Game Boy Advance")
        ) {
          continue
        }

        // Extract metadata fields
        const metadata: ParsedMetadata = {
          name: name,
          databaseId:
            parseInt(this.extractField(gameXml, "DatabaseID") || "0") ||
            undefined,
          releaseYear: this.extractField(gameXml, "ReleaseYear"),
          releaseDate: this.extractField(gameXml, "ReleaseDate"),
          overview: this.extractField(gameXml, "Overview"),
          developer: this.extractField(gameXml, "Developer"),
          publisher: this.extractField(gameXml, "Publisher"),
          genres: this.extractField(gameXml, "Genres"),
          esrb: this.extractField(gameXml, "ESRB"),
        }

        // Parse rating if available
        const ratingStr = this.extractField(gameXml, "CommunityRating")
        if (ratingStr) {
          metadata.rating = parseFloat(ratingStr)
        }

        // Index by normalized name
        const normalized = this.normalizeGameName(name)
        this.metadataIndex.set(normalized.toLowerCase(), metadata)

        // Also index the raw name for exact matches
        this.metadataIndex.set(name.toLowerCase(), metadata)

        gbaCount++

        // Log progress every 1000 games
        if (processedCount % 5000 === 0) {
          console.log(
            `  Processed ${processedCount} games, found ${gbaCount} GBA games...`,
          )
        }
      }

      console.log(
        `✓ LaunchBox indexed ${gbaCount} GBA games (scanned ${processedCount} total games)`,
      )
      this.initialized = true
    } catch (error) {
      console.error(
        "Error loading LaunchBox metadata:",
        (error as Error).message,
      )
      this.initialized = true
    }
  }

  /**
   * Extract a field value from game XML using regex
   */
  private extractField(gameXml: string, fieldName: string): string | undefined {
    const regex = new RegExp(`<${fieldName}>([^<]+)<\/${fieldName}>`)
    const match = gameXml.match(regex)
    return match ? match[1] : undefined
  }

  /**
   * Get metadata for a game by name
   */
  getMetadata(gameName: string): ParsedMetadata | null {
    if (!this.initialized) {
      console.warn("LaunchBox service not initialized")
      return null
    }

    // Try different normalization strategies
    const searchNames = [
      gameName, // Original
      this.normalizeGameName(gameName), // Remove extensions & parentheses
      this.normalizeGameName(gameName).split(/\s+\(/)[0], // Before first parenthesis
      gameName.replace(/\.(zip|7z|rom|gba|iso|z64|n64|v64)$/i, ""), // Just remove extension
    ]

    for (const searchName of searchNames) {
      const normalized = searchName.toLowerCase().trim()

      // Exact match in index
      let metadata = this.metadataIndex.get(normalized)
      if (metadata) return metadata

      // Partial matches
      for (const [key, value] of this.metadataIndex.entries()) {
        // Check if search name starts with indexed name or vice versa
        if (key.startsWith(normalized) || normalized.startsWith(key)) {
          // Verify it's a good match (at least 60% similar)
          if (this.isSimilar(normalized, key, 0.6)) {
            return value
          }
        }
      }
    }

    return null
  }

  /**
   * Check if two strings are similar (simple Levenshtein-based)
   */
  private isSimilar(
    str1: string,
    str2: string,
    threshold: number = 0.8,
  ): boolean {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return true

    const editDistance = this.levenshteinDistance(longer, shorter)
    const similarity = 1.0 - editDistance / longer.length

    return similarity >= threshold
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
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

  /**
   * Search for games by partial name
   */
  searchGames(query: string, limit: number = 10): ParsedMetadata[] {
    if (!this.initialized) return []

    const normalized = this.normalizeGameName(query).toLowerCase()
    const results: ParsedMetadata[] = []

    for (const [key, metadata] of this.metadataIndex.entries()) {
      if (key.includes(normalized)) {
        results.push(metadata)
        if (results.length >= limit) break
      }
    }

    return results
  }

  /**
   * Get all indexed games count
   */
  getGameCount(): number {
    return this.metadataIndex.size
  }

  /**
   * Private helper to normalize game names
   * Removes extensions and common ROM identifiers
   */
  private normalizeGameName(name: string): string {
    return name
      .replace(/\.(zip|rom|gba|iso)$/i, "") // Remove file extension
      .replace(/\s*\([^)]*\)/g, "") // Remove parentheticals (region, language, etc)
      .replace(/\s*[-:]\s*/g, " ") // Normalize - and : to space
      .replace(/\s+/g, " ") // Normalize multiple spaces
      .trim()
  }
}

// Singleton instance
let launchboxServiceInstance: LaunchBoxService | null = null

/**
 * Get or create LaunchBox service instance
 */
export function getLaunchBoxService(dataDir?: string): LaunchBoxService {
  if (!launchboxServiceInstance) {
    launchboxServiceInstance = new LaunchBoxService(dataDir)
  }
  return launchboxServiceInstance
}
