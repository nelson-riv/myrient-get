export interface MyrientSource {
  id: string
  label: string
  platform: string
  baseURL: string
}

export interface Game {
  id: number
  filename: string
  name: string
  size: string
  date: string
  source_id: string
  source_url: string
  platform: string
  downloaded: 0 | 1
  download_path: string | null
  created_at: string
  downloaded_at?: string | null
  gdb_id?: number
  box_art?: string
  release_date?: string
  developer?: string
  publisher?: string
  description?: string
}

export interface GameData {
  games: Game[]
  nextId: number
}

export interface GameInput {
  filename: string
  name: string
  size: string
  date: string
  source_id: string
  source_url: string
  platform: string
  downloaded?: 0 | 1
  download_path?: string | null
  created_at?: string
}

export type StoredGameRecord = Omit<Game, "source_id" | "source_url" | "platform"> &
  Partial<Pick<Game, "source_id" | "source_url" | "platform">>

export interface MyrientGameListing {
  filename: string
  size: string
  date: string
  source_id: string
  source_url: string
  platform: string
}

export interface Collection {
  id: number
  name: string
  description: string | null
  created_at: string
  game_count: number
}

export type QueueStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"

export interface QueueItem {
  id: number
  game_id: number
  status: QueueStatus
  error: string | null
  attempts: number
  created_at: string
  updated_at: string
  game?: Game
}

export interface ServiceStatus {
  name: string
  status: "ready" | "degraded" | "unavailable"
  detail?: string
}
