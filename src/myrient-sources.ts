import { MyrientSource } from "./app-types"

export const MYRIENT_SOURCES: MyrientSource[] = [
  {
    id: "gba-retroachievements",
    label: "RetroAchievements GBA",
    platform: "Nintendo Game Boy Advance",
    baseURL:
      "https://myrient.erista.me/files/RetroAchievements/RA%20-%20Nintendo%20Game%20Boy%20Advance/",
  },
  {
    id: "n64-bigendian",
    label: "No-Intro Nintendo 64 (BigEndian)",
    platform: "Nintendo 64",
    baseURL:
      "https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%2064%20%28BigEndian%29/",
  },
  {
    id: "nes-headered",
    label: "No-Intro Nintendo Entertainment System (Headered)",
    platform: "Nintendo Entertainment System",
    baseURL:
      "https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Nintendo%20Entertainment%20System%20%28Headered%29/",
  },
  {
    id: "snes-no-intro",
    label: "No-Intro Super Nintendo Entertainment System",
    platform: "Super Nintendo Entertainment System",
    baseURL:
      "https://myrient.erista.me/files/No-Intro/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/",
  },
  {
    id: "ps1-redump",
    label: "Redump Sony PlayStation",
    platform: "Sony PlayStation",
    baseURL: "https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation/",
  },
  {
    id: "ps2-redump",
    label: "Redump Sony PlayStation 2",
    platform: "Sony PlayStation 2",
    baseURL:
      "https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation%202/",
  },
  {
    id: "psp-redump",
    label: "Redump Sony PlayStation Portable",
    platform: "Sony PlayStation Portable",
    baseURL:
      "https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation%20Portable/",
  },
]

export const DEFAULT_MYRIENT_SOURCE = MYRIENT_SOURCES[0]

const MYRIENT_SOURCE_BY_ID = new Map(
  MYRIENT_SOURCES.map((source) => [source.id, source]),
)

export function getMyrientSource(
  sourceId?: string | null,
  sourceUrl?: string | null,
): MyrientSource {
  if (sourceId) {
    const source = MYRIENT_SOURCE_BY_ID.get(sourceId)
    if (source) {
      return source
    }
  }

  if (sourceUrl) {
    const source = MYRIENT_SOURCES.find((entry) => entry.baseURL === sourceUrl)
    if (source) {
      return source
    }
  }

  return DEFAULT_MYRIENT_SOURCE
}
