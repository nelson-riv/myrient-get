import "./env"

type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function getConfiguredLevel(): LogLevel {
  const rawLevel = String(process.env.LOG_LEVEL || "info").toLowerCase()
  if (rawLevel === "debug" || rawLevel === "info" || rawLevel === "warn") {
    return rawLevel
  }
  return "error" === rawLevel ? "error" : "info"
}

const configuredLevel = getConfiguredLevel()

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLevel]
}

function formatMessage(level: LogLevel, message: string): string {
  return `[${level.toUpperCase()}] ${message}`
}

export const logger = {
  debug(message: string, ...data: unknown[]): void {
    if (shouldLog("debug")) {
      console.debug(formatMessage("debug", message), ...data)
    }
  },
  info(message: string, ...data: unknown[]): void {
    if (shouldLog("info")) {
      console.log(formatMessage("info", message), ...data)
    }
  },
  warn(message: string, ...data: unknown[]): void {
    if (shouldLog("warn")) {
      console.warn(formatMessage("warn", message), ...data)
    }
  },
  error(message: string, ...data: unknown[]): void {
    if (shouldLog("error")) {
      console.error(formatMessage("error", message), ...data)
    }
  },
}
