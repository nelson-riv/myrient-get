import axios from "axios"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import {
  LookupAddress,
  promises as dns,
} from "dns"
import * as net from "net"
import * as http from "http"
import * as https from "https"

const IMAGE_CACHE_DIR = path.join(__dirname, "..", "data", "image-cache")
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_REMOTE_IMAGE_HOSTS = new Set([
  "cdn.thegamesdb.net",
  "images.launchbox-app.com",
  "gamesdb.launchbox-app.com",
])

interface CachedImage {
  filename: string
  originalUrl: string
  localPath: string
  cachedAt: number
}

type PinnedAddress = {
  address: string
  family: number
}

type AgentLookup = NonNullable<http.AgentOptions["lookup"]>

/**
 * Image Cache Service
 * Downloads and caches game box art images locally with efficient storage
 */
export class ImageCacheService {
  private cacheIndex: Map<string, CachedImage> = new Map()
  private cacheIndexFile: string
  private initialized = false

  constructor() {
    this.cacheIndexFile = path.join(IMAGE_CACHE_DIR, "cache-index.json")
    this.ensureCacheDir()
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) {
      fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true })
    }
  }

  /**
   * Initialize the cache service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      this.ensureCacheDir()

      // Load existing cache index if available
      if (fs.existsSync(this.cacheIndexFile)) {
        const indexData = fs.readFileSync(this.cacheIndexFile, "utf-8")
        const index = JSON.parse(indexData)
        this.cacheIndex = new Map(
          Object.entries(index) as [string, CachedImage][],
        )
        console.log(
          `✓ Image cache initialized with ${this.cacheIndex.size} cached images`,
        )
      } else {
        console.log("Image cache: Ready for new downloads")
      }

      this.initialized = true
    } catch (error) {
      console.error("Error initializing image cache:", (error as Error).message)
      this.initialized = true
    }
  }

  /**
   * Download and cache an image
   * Returns local path if successful, null otherwise
   */
  async downloadAndCache(
    gameTitle: string,
    imageUrl: string,
  ): Promise<string | null> {
    if (!this.initialized) {
      console.warn("Image cache not initialized")
      return null
    }

    // Check if already cached
    const cacheKey = this.generateCacheKey(gameTitle, imageUrl)
    const cached = this.cacheIndex.get(cacheKey)

    if (cached && fs.existsSync(cached.localPath)) {
      return cached.localPath
    }

    try {
      const parsedUrl = new URL(imageUrl)
      const pinnedAddress = await this.assertSafeRemoteImageUrl(imageUrl)
      const pinnedLookup = this.createPinnedLookup(parsedUrl.hostname, pinnedAddress)

      // Download image
      console.log(`  Downloading: ${gameTitle}`)
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 10000,
        maxContentLength: MAX_IMAGE_BYTES,
        maxBodyLength: MAX_IMAGE_BYTES,
        maxRedirects: 0,
        httpAgent: new http.Agent({ lookup: pinnedLookup }),
        httpsAgent: new https.Agent({ lookup: pinnedLookup }),
        headers: {
          "User-Agent": "Myrient-Get/1.0 (+https://github.com/myrient-get)",
        },
      })

      const contentType = String(response.headers["content-type"] || "")
      if (!contentType.toLowerCase().startsWith("image/")) {
        throw new Error("Remote response is not an image")
      }

      const contentLengthHeader = Number(response.headers["content-length"] || 0)
      if (contentLengthHeader > MAX_IMAGE_BYTES) {
        throw new Error("Remote image exceeds size limit")
      }

      const data = Buffer.from(response.data)
      if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
        throw new Error("Remote image payload is invalid")
      }

      // Generate filename based on game title
      const ext = this.getImageExtension(contentType)
      const safeTitle = gameTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      const filename = `${safeTitle}.${ext}`
      const localPath = path.join(IMAGE_CACHE_DIR, filename)

      // Save image
      fs.writeFileSync(localPath, data)

      // Update cache index
      const cacheEntry: CachedImage = {
        filename,
        originalUrl: imageUrl,
        localPath,
        cachedAt: Date.now(),
      }

      this.cacheIndex.set(cacheKey, cacheEntry)
      this.saveCacheIndex()

      return localPath
    } catch (error) {
      console.warn(
        `Failed to cache image for "${gameTitle}":`,
        (error as Error).message,
      )
      return null
    }
  }

  /**
   * Get cached image path
   */
  getCachedImage(gameTitle: string, imageUrl: string): string | null {
    const cacheKey = this.generateCacheKey(gameTitle, imageUrl)
    const cached = this.cacheIndex.get(cacheKey)

    if (cached && fs.existsSync(cached.localPath)) {
      return cached.localPath
    }

    return null
  }

  /**
   * Get cache size in MB
   */
  getCacheSize(): number {
    let totalSize = 0
    for (const cached of this.cacheIndex.values()) {
      if (fs.existsSync(cached.localPath)) {
        const stats = fs.statSync(cached.localPath)
        totalSize += stats.size
      }
    }
    return totalSize / (1024 * 1024) // Convert to MB
  }

  /**
   * Clear old cached images (older than days)
   */
  clearOldCache(days: number = 30): number {
    let removed = 0
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000

    for (const [key, cached] of this.cacheIndex.entries()) {
      if (cached.cachedAt < cutoffTime) {
        try {
          if (fs.existsSync(cached.localPath)) {
            fs.unlinkSync(cached.localPath)
          }
          this.cacheIndex.delete(key)
          removed++
        } catch (error) {
          console.warn(`Failed to delete cached image: ${cached.filename}`)
        }
      }
    }

    if (removed > 0) {
      this.saveCacheIndex()
      console.log(`Cleared ${removed} old cached images`)
    }

    return removed
  }

  /**
   * Private helper: Generate cache key
   */
  private generateCacheKey(gameTitle: string, imageUrl: string): string {
    return crypto
      .createHash("sha256")
      .update(`${gameTitle}:${imageUrl}`)
      .digest("hex")
      .substring(0, 16)
  }

  /**
   * Private helper: Get image extension from content type
   */
  private getImageExtension(contentType: string): string {
    const type = contentType.toLowerCase()
    if (type.includes("jpeg") || type.includes("jpg")) return "jpg"
    if (type.includes("png")) return "png"
    if (type.includes("webp")) return "webp"
    if (type.includes("gif")) return "gif"
    return "jpg" // Default
  }

  private async assertSafeRemoteImageUrl(imageUrl: string): Promise<PinnedAddress> {
    const parsedUrl = new URL(imageUrl)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (parsedUrl.protocol !== "https:") {
      throw new Error("Only HTTPS image URLs are allowed")
    }

    if (!ALLOWED_REMOTE_IMAGE_HOSTS.has(hostname)) {
      throw new Error("Image host is not allowed")
    }

    const addresses = await dns.lookup(hostname, { all: true })
    if (addresses.length === 0) {
      throw new Error("Unable to resolve remote image host")
    }

    for (const addressInfo of addresses) {
      if (this.isPrivateOrLoopbackIp(addressInfo.address)) {
        throw new Error("Resolved image host points to a private network")
      }
    }

    return {
      address: addresses[0].address,
      family: addresses[0].family,
    }
  }

  private createPinnedLookup(
    expectedHostname: string,
    pinnedAddress: PinnedAddress,
  ): AgentLookup {
    const pinnedLookup = (
      (
        hostname: string,
        _options: unknown,
        callback: (
          error: Error | null,
          address: string,
          family: number,
        ) => void,
      ) => {
        if (hostname.toLowerCase() !== expectedHostname.toLowerCase()) {
          callback(
            new Error("Unexpected hostname during remote image fetch"),
            pinnedAddress.address,
            pinnedAddress.family,
          )
          return
        }

        callback(null, pinnedAddress.address, pinnedAddress.family)
      }
    ) as AgentLookup

    return pinnedLookup
  }

  private isPrivateOrLoopbackIp(address: string): boolean {
    if (net.isIPv4(address)) {
      return (
        address.startsWith("10.") ||
        address.startsWith("127.") ||
        address.startsWith("169.254.") ||
        address.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
      )
    }

    if (net.isIPv6(address)) {
      const normalized = address.toLowerCase()
      return (
        normalized === "::1" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe80:")
      )
    }

    return true
  }

  /**
   * Private helper: Save cache index
   */
  private saveCacheIndex(): void {
    try {
      const indexData: Record<string, CachedImage> = {}
      for (const [key, value] of this.cacheIndex.entries()) {
        indexData[key] = value
      }
      fs.writeFileSync(
        this.cacheIndexFile,
        JSON.stringify(indexData, null, 2),
        "utf-8",
      )
    } catch (error) {
      console.error("Error saving cache index:", (error as Error).message)
    }
  }
}

// Singleton instance
let imageCacheServiceInstance: ImageCacheService | null = null

/**
 * Get or create image cache service instance
 */
export function getImageCacheService(): ImageCacheService {
  if (!imageCacheServiceInstance) {
    imageCacheServiceInstance = new ImageCacheService()
  }
  return imageCacheServiceInstance
}
