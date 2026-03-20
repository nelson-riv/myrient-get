import axios from "axios"
import * as cheerio from "cheerio"

const LAUNCHBOX_BASE_URL = "https://gamesdb.launchbox-app.com"
const LAUNCHBOX_IMAGE_HOST = "images.launchbox-app.com"
const PREFERRED_MEDIA_SECTIONS = [
  "Box - Front",
  "Poster",
  "Box - 3D",
  "Cart - Front",
  "Box - Back",
  "Banner",
]

export class LaunchBoxBoxArtService {
  async getBoxArt(databaseId: number): Promise<string | null> {
    const url = `${LAUNCHBOX_BASE_URL}/games/details/${databaseId}`
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Myrient-Get/1.0 (+https://github.com/myrient-get)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })

    const $ = cheerio.load(String(response.data))
    const mediaBySection = new Map<string, string[]>()

    $("h3").each((_index, element) => {
      const sectionLabel = $(element).text().replace(/\s+/g, " ").trim()
      if (!sectionLabel) {
        return
      }

      const sectionUrls = $(element)
        .next("div")
        .find("img")
        .map((_imgIndex, img) => this.normalizeLaunchBoxImageUrl($(img).attr("src")))
        .get()
        .filter((url): url is string => Boolean(url))

      if (sectionUrls.length > 0) {
        mediaBySection.set(sectionLabel, sectionUrls)
      }
    })

    for (const sectionLabel of PREFERRED_MEDIA_SECTIONS) {
      const sectionUrls = mediaBySection.get(sectionLabel)
      if (sectionUrls && sectionUrls.length > 0) {
        return sectionUrls[0]
      }
    }

    const fallbackUrls = $("img")
      .map((_index, img) => this.normalizeLaunchBoxImageUrl($(img).attr("src")))
      .get()
      .filter((url): url is string => Boolean(url))

    return fallbackUrls[0] || null
  }

  private normalizeLaunchBoxImageUrl(sourceUrl?: string | null): string | null {
    if (!sourceUrl) {
      return null
    }

    let normalized = sourceUrl.trim()
    if (!normalized) {
      return null
    }

    if (normalized.startsWith("//")) {
      normalized = `https:${normalized}`
    } else if (normalized.startsWith("/")) {
      normalized = `${LAUNCHBOX_BASE_URL}${normalized}`
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(normalized)
    } catch {
      return null
    }

    if (parsedUrl.hostname !== LAUNCHBOX_IMAGE_HOST) {
      return null
    }

    parsedUrl.pathname = parsedUrl.pathname.replace(/\/{2,}/g, "/")
    return parsedUrl.toString()
  }
}

let launchBoxBoxArtServiceInstance: LaunchBoxBoxArtService | null = null

export function getLaunchBoxBoxArtService(): LaunchBoxBoxArtService {
  if (!launchBoxBoxArtServiceInstance) {
    launchBoxBoxArtServiceInstance = new LaunchBoxBoxArtService()
  }
  return launchBoxBoxArtServiceInstance
}
