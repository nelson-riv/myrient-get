import { NextFunction, Request, Response } from "express"
import { ZodError, ZodObject, ZodSchema, z } from "zod"

function respondValidationError(res: Response, error: ZodError): void {
  res.status(400).json({
    success: false,
    error: "Invalid request",
    details: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  })
}

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      respondValidationError(res, parsed.error)
      return
    }
    req.body = parsed.data
    next()
  }
}

export function validateQuery<T extends ZodObject>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      respondValidationError(res, parsed.error)
      return
    }
    Object.assign(req.query, parsed.data)
    next()
  }
}

export function validateParams<T extends ZodObject>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) {
      respondValidationError(res, parsed.error)
      return
    }
    req.params = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [key, String(value)]),
    )
    next()
  }
}

export const requestSchemas = {
  idParam: z.object({
    id: z.coerce.number().int().positive(),
  }),
  download: z.object({
    gameId: z.coerce.number().int().positive(),
  }),
  cancelDownload: z.object({
    gameId: z.coerce.number().int().positive(),
  }),
  metadata: z.object({
    gameId: z.coerce.number().int().positive(),
    gameName: z.string().min(1),
  }),
  launchboxMetadata: z.object({
    gameName: z.string().min(1),
  }),
  launchboxSearch: z.object({
    q: z.string().min(1),
    limit: z.coerce.number().int().positive().max(50).optional(),
  }),
  localSearch: z.object({
    q: z.string().min(1),
  }),
  cacheImage: z.object({
    gameName: z.string().min(1),
    imageUrl: z.union([
      z.string().url().max(2048),
      z.string().regex(/^\/cached-images\/[^\/\\]+$/),
    ]),
  }),
  clearImageCache: z.object({
    days: z.coerce.number().int().positive().max(3650).optional(),
  }),
  thegamesdbSearch: z.object({
    name: z.string().min(1),
  }),
  fetchBoxArt: z.object({
    gdbId: z.coerce.number().int().positive(),
    gameName: z.string().min(1),
  }),
  saveBoxArt: z.object({
    gameId: z.coerce.number().int().positive(),
    boxArtPath: z.string().regex(/^\/cached-images\/[^\/\\]+$/),
  }),
  collectionCreate: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional().nullable(),
  }),
  collectionGame: z.object({
    gameId: z.coerce.number().int().positive(),
  }),
  queueItem: z.object({
    gameId: z.coerce.number().int().positive(),
  }),
  queueIdParam: z.object({
    queueId: z.coerce.number().int().positive(),
  }),
  collectionGameParams: z.object({
    id: z.coerce.number().int().positive(),
    gameId: z.coerce.number().int().positive(),
  }),
}
