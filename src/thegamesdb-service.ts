import "./env"
import axios, { AxiosError } from "axios"

// TheGamesDB API configuration
const THEGAMESDB_API_URL = "https://api.thegamesdb.net/v1"
const THEGAMESDB_PUBLIC_KEY = process.env.THEGAMESDB_API_KEY?.trim() ?? ""

interface TheGamesDBGame {
  id: number
  game_title: string
  release_date?: string
  developers?: number[] // Developer IDs
  publishers?: number[] // Publisher IDs
  overview?: string
  rating?: string
  platform?: number
  genres?: number[] // Genre IDs
}

interface TheGamesDBImage {
  id: number
  type: string
  side: string
  filename: string
  resolution: string
}

interface GameMetadata {
  id: number
  name: string
  releaseDate?: string
  overview?: string
  rating?: number
  developer?: string
  publisher?: string
  genres?: string
  boxArtUrl?: string
}

export function cleanTheGamesDBGameName(name: string): string {
  return name
    .replace(/\.(zip|7z|rom|gba|iso|z64|n64|v64)$/i, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * TheGamesDB Fallback Metadata Service
 * Uses TheGamesDB API as a fallback when LaunchBox data is unavailable
 */
class TheGamesDBService {
  private initialized = false
  private requestCount = 0
  private lastRequestTime = 0
  private minDelay = 100 // Minimum delay between requests (ms)

  /**
   * Initialize the service (can be used to validate connection)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    if (!THEGAMESDB_PUBLIC_KEY) {
      console.warn("TheGamesDB API key missing; fallback metadata disabled")
      this.initialized = false
      return
    }

    try {
      // Quick validation by fetching available platforms
      const response = await axios.get(`${THEGAMESDB_API_URL}/Platforms`, {
        params: { apikey: THEGAMESDB_PUBLIC_KEY },
        timeout: 15000, // Increased timeout for first request
      })

      if (response.data) {
        console.log("✓ TheGamesDB service initialized and accessible")
        this.initialized = true
      }
    } catch (error) {
      console.error(
        "✗ TheGamesDB service unavailable:",
        (error as Error).message,
      )
      this.initialized = false
      // Don't throw - allow app to start without this service
    }
  }

  /**
   * Search for a game by name
   */
  async searchGame(gameName: string): Promise<TheGamesDBGame | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!this.initialized) {
      console.warn("TheGamesDB service not available")
      return null
    }

    try {
      // Rate limiting: respect minimum delay
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < this.minDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.minDelay - timeSinceLastRequest),
        )
      }

      this.lastRequestTime = Date.now()
      this.requestCount++

      const response = await axios.get(
        `${THEGAMESDB_API_URL}/Games/ByGameName`,
        {
          params: {
            name: cleanTheGamesDBGameName(gameName),
            apikey: THEGAMESDB_PUBLIC_KEY,
          },
          timeout: 10000,
        },
      )

      const games = response.data?.data?.games || []

      if (games.length === 0) {
        return null
      }

      // Return the first match (ideally most relevant)
      return games[0] as TheGamesDBGame
    } catch (error) {
      const err = error as AxiosError
      if (err.response?.status === 404) {
        return null // Game not found is not an error
      }
      console.error("Error searching TheGamesDB:", (error as Error).message)
      return null
    }
  }

  /**
   * Get full metadata for a game by ID
   */
  async getGameMetadata(gameId: number): Promise<GameMetadata | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!this.initialized) {
      return null
    }

    try {
      // Rate limiting
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < this.minDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.minDelay - timeSinceLastRequest),
        )
      }

      this.lastRequestTime = Date.now()
      this.requestCount++

      const response = await axios.get(`${THEGAMESDB_API_URL}/Games/ByGameID`, {
        params: {
          id: gameId,
          apikey: THEGAMESDB_PUBLIC_KEY,
        },
        timeout: 10000,
      })

      const game = response.data?.data?.games?.[0]

      if (!game) {
        return null
      }

      // Fetch additional metadata (developers, publishers)
      const metadata: GameMetadata = {
        id: game.id,
        name: game.game_title,
        releaseDate: game.release_date,
        overview: game.overview,
        rating: parseFloat(game.rating || "0"),
      }

      // Try to fetch developers and publishers
      try {
        const devPublInfo = await this.getDevelopersAndPublishers(
          game.developers,
          game.publishers,
        )
        metadata.developer = devPublInfo.developer
        metadata.publisher = devPublInfo.publisher
      } catch {
        // Silently continue if this fails
      }

      // Try to fetch genres
      try {
        const genres = await this.getGenres(game.genres)
        if (genres.length > 0) {
          metadata.genres = genres.join(", ")
        }
      } catch {
        // Silently continue if this fails
      }

      return metadata
    } catch (error) {
      console.error(
        "Error fetching TheGamesDB metadata:",
        (error as Error).message,
      )
      return null
    }
  }

  /**
   * Get box art image URL for a game
   */
  async getBoxArt(gameId: number): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (!this.initialized) {
      return null
    }

    try {
      // Rate limiting
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < this.minDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.minDelay - timeSinceLastRequest),
        )
      }

      this.lastRequestTime = Date.now()
      this.requestCount++

      const response = await axios.get(`${THEGAMESDB_API_URL}/Games/Images`, {
        params: {
          games_id: gameId,
          apikey: THEGAMESDB_PUBLIC_KEY,
        },
        timeout: 10000,
      })

      const images = response.data?.data?.images?.[String(gameId)] || []

      // Look for boxart front image (preferred)
      const boxart = images.find(
        (img: TheGamesDBImage) =>
          img.type === "boxart" && (img.side === "front" || img.side === "1"),
      )

      if (boxart && boxart.filename) {
        // TheGamesDB CDN URL format
        return `https://cdn.thegamesdb.net/images/original/${boxart.filename}`
      }

      // Fallback to any boxart
      const anyBoxart = images.find(
        (img: TheGamesDBImage) => img.type === "boxart",
      )
      if (anyBoxart && anyBoxart.filename) {
        return `https://cdn.thegamesdb.net/images/original/${anyBoxart.filename}`
      }

      return null
    } catch (error) {
      console.error(
        "Error fetching TheGamesDB images:",
        (error as Error).message,
      )
      return null
    }
  }

  /**
   * Get developers and publishers info
   */
  private async getDevelopersAndPublishers(
    devIds?: number[],
    pubIds?: number[],
  ): Promise<{
    developer?: string
    publisher?: string
  }> {
    const result: {
      developer?: string
      publisher?: string
    } = {}

    try {
      if (devIds && devIds.length > 0) {
        const devResponse = await axios.get(
          `${THEGAMESDB_API_URL}/Developers`,
          {
            params: {
              id: devIds[0], // Use first developer ID
              apikey: THEGAMESDB_PUBLIC_KEY,
            },
            timeout: 10000,
          },
        )

        const dev = devResponse.data?.data?.developers?.[0]
        if (dev?.name) {
          result.developer = dev.name
        }
      }

      if (pubIds && pubIds.length > 0) {
        const pubResponse = await axios.get(
          `${THEGAMESDB_API_URL}/Publishers`,
          {
            params: {
              id: pubIds[0], // Use first publisher ID
              apikey: THEGAMESDB_PUBLIC_KEY,
            },
            timeout: 10000,
          },
        )

        const pub = pubResponse.data?.data?.publishers?.[0]
        if (pub?.name) {
          result.publisher = pub.name
        }
      }
    } catch (error) {
      console.debug(
        "Note: Could not fetch developer/publisher details",
        (error as Error).message,
      )
    }

    return result
  }

  /**
   * Get genre names
   */
  private async getGenres(genreIds?: number[]): Promise<string[]> {
    if (!genreIds || genreIds.length === 0) {
      return []
    }

    try {
      const response = await axios.get(`${THEGAMESDB_API_URL}/Genres`, {
        params: {
          apikey: THEGAMESDB_PUBLIC_KEY,
        },
        timeout: 10000,
      })

      const allGenres = response.data?.data?.genres || []
      const genreNames: string[] = []

      for (const genreId of genreIds) {
        const genre = allGenres.find((g: any) => g.id === genreId)
        if (genre?.name) {
          genreNames.push(genre.name)
        }
      }

      return genreNames
    } catch (error) {
      console.debug(
        "Note: Could not fetch genre details",
        (error as Error).message,
      )
      return []
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    initialized: boolean
    requestCount: number
  } {
    return {
      initialized: this.initialized,
      requestCount: this.requestCount,
    }
  }
}

// Singleton instance
let instance: TheGamesDBService | null = null

export function getTheGamesDBService(): TheGamesDBService {
  if (!instance) {
    instance = new TheGamesDBService()
  }
  return instance
}

export { GameMetadata, TheGamesDBGame }
