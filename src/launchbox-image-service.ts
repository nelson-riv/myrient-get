/**
 * @deprecated This service is no longer used.
 * All image fetching is now handled exclusively by TheGamesDB Service (thegamesdb-service.ts).
 * Image caching is handled by Image Cache Service (image-cache-service.ts).
 * This file is kept for reference only and can be safely removed.
 *
 * MIGRATION PATH:
 * - Image fetching: Use getTheGamesDBService() and getBoxArt() method
 * - Image caching: Use getImageCacheService() methods
 * - Image serving: Use /cached-images static route in server.ts
 */

import axios from "axios"
import * as fs from "fs"
import * as path from "path"

/**
 * LaunchBox Image Service
 * Fetches game images from LaunchBox's image API
 */
export class LaunchBoxImageService {
  private cacheDir: string
  private imageCacheIndex: Map<string, string> = new Map()

  constructor(
    cacheDir: string = path.join(__dirname, "..", "data", "launchbox-images"),
  ) {
    this.cacheDir = cacheDir
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
    this.loadImageIndex()
  }

  /**
   * Load cached image mappings from disk
   */
  private loadImageIndex(): void {
    const indexFile = path.join(this.cacheDir, "image-index.json")
    if (fs.existsSync(indexFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexFile, "utf-8"))
        this.imageCacheIndex = new Map(data)
      } catch (error) {
        console.warn(
          "Could not load image cache index:",
          (error as Error).message,
        )
      }
    }
  }

  /**
   * Save image index to disk
   */
  private saveImageIndex(): void {
    const indexFile = path.join(this.cacheDir, "image-index.json")
    try {
      fs.writeFileSync(
        indexFile,
        JSON.stringify(Array.from(this.imageCacheIndex.entries())),
        "utf-8",
      )
    } catch (error) {
      console.warn(
        "Could not save image cache index:",
        (error as Error).message,
      )
    }
  }

  /**
   * Fetch box art image from LaunchBox for a game ID
   * Scrapes the LaunchBox games database page to find box art URLs
   */
  async fetchBoxArt(databaseId: number): Promise<string | null> {
    const cacheKey = `boxart-${databaseId}`

    // Check cache first
    if (this.imageCacheIndex.has(cacheKey)) {
      const cached = this.imageCacheIndex.get(cacheKey)
      return cached ? cached : null
    }

    try {
      // Construct LaunchBox database URL
      // The URL pattern is: https://gamesdb.launchbox-app.com/games/details/{id}-{slug}
      // We'll fetch the game details page and extract the box art image URL
      const url = `https://gamesdb.launchbox-app.com/games/details/${databaseId}`

      console.log(`Fetching images for database ID ${databaseId}...`)

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      })

      const html = response.data

      // Parse HTML to find box art image
      // Look for image URLs in the common formats used by LaunchBox
      let imageUrls: string[] = []

      // Try to find all image URLs (with or without double slashes)
      const match1 = html.match(
        /https:\/\/images\.launchbox-app\.com\/[\/]{0,1}[a-f0-9\-\.]+\.(jpg|png|jpeg)/gi,
      )
      if (match1) {
        imageUrls = [...imageUrls, ...match1]
      }

      // Also try looking for image URLs in img tags
      const match2 = html.match(
        /src=["']?(https:\/\/images\.launchbox-app\.com[^"'\s>]+)["']?/gi,
      )
      if (match2) {
        const extractedUrls = match2
          .map(
            (m: string) =>
              m.match(/(https:\/\/images\.launchbox-app\.com[^"'\s>]+)/)?.[1],
          )
          .filter(Boolean) as string[]
        imageUrls = [...imageUrls, ...extractedUrls]
      }

      // Deduplicate URLs
      const uniqueUrls = [...new Set(imageUrls)]

      if (uniqueUrls.length > 0) {
        // Use the first URL found
        const boxArtUrl = uniqueUrls[0]

        console.log(
          `✓ Found box art for database ID ${databaseId}: ${boxArtUrl}`,
        )
        this.imageCacheIndex.set(cacheKey, boxArtUrl)
        this.saveImageIndex()
        return boxArtUrl
      }

      console.log(`✗ No box art found for database ID ${databaseId}`)
      // No image found - cache empty result to avoid repeated requests
      this.imageCacheIndex.set(cacheKey, "")
      this.saveImageIndex()
      return null
    } catch (error) {
      console.warn(
        `Could not fetch box art for database ID ${databaseId}:`,
        (error as Error).message,
      )
      return null
    }
  }

  /**
   * Fetch multiple image types from LaunchBox
   */
  async fetchGameImages(databaseId: number): Promise<{
    boxArt: string | null
    screenshot: string | null
    clearLogo: string | null
  }> {
    try {
      const url = `https://gamesdb.launchbox-app.com/games/details/${databaseId}`

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "Myrient-Get/1.0 (+https://github.com/myrient-get)",
        },
      })

      // Extract all image URLs
      const imageUrls =
        response.data.match(
          /https:\/\/images\.launchbox-app\.com\/\/[a-f0-9\-]+\.(jpg|png|jpeg)/gi,
        ) || []

      return {
        boxArt: imageUrls[0] || null,
        screenshot:
          imageUrls.find((url: string) => url.includes("screenshot")) ||
          imageUrls[1] ||
          null,
        clearLogo:
          imageUrls.find((url: string) => url.includes("logo")) || null,
      }
    } catch (error) {
      console.warn(
        `Could not fetch images for database ID ${databaseId}:`,
        (error as Error).message,
      )
      return {
        boxArt: null,
        screenshot: null,
        clearLogo: null,
      }
    }
  }

  /**
   * Clear the image cache
   */
  clearCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir)
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file)
        if (fs.statSync(filePath).isFile() && file !== "image-index.json") {
          fs.unlinkSync(filePath)
        }
      }
      this.imageCacheIndex.clear()
      this.saveImageIndex()
    } catch (error) {
      console.warn("Could not clear image cache:", (error as Error).message)
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number
    cachedImages: number
  } {
    let totalSize = 0
    const files = fs.readdirSync(this.cacheDir)

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file)
      if (fs.statSync(filePath).isFile()) {
        totalSize += fs.statSync(filePath).size
      }
    }

    return {
      cacheSize: totalSize,
      cachedImages: this.imageCacheIndex.size,
    }
  }
}

// Singleton instance
let instance: LaunchBoxImageService | null = null

export function getImageService(): LaunchBoxImageService {
  if (!instance) {
    instance = new LaunchBoxImageService()
  }
  return instance
}
