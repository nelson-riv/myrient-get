# Architecture Overview

## Stack

- Backend: Node.js, Express, TypeScript
- Database: SQLite via `better-sqlite3`
- Frontend: plain HTML, CSS, and browser JavaScript
- Scraping and HTTP: `axios`, `cheerio`
- Validation: `zod`

## High-level structure

```text
Browser UI
  -> public\index.html
  -> public\styles.css
  -> public\app.js

Express API
  -> src\server.ts
  -> src\validation.ts
  -> src\logger.ts

Services
  -> src\db-service.ts
  -> src\launchbox-service.ts
  -> src\image-cache-service.ts
  -> src\thegamesdb-service.ts
   -> src\myrient-sources.ts
   -> src\app-types.ts
```

## Storage

Primary application storage is `data\games.db`.

Persisted data includes:

- games
- collections
- collection membership
- download queue
- recent download timestamps

## Runtime responsibilities

### `src\server.ts`

Coordinates:

- Myrient scraping
- download streaming
- queue processing
- metadata sync scheduling
- API route wiring
- service health reporting

### `src\db-service.ts`

Encapsulates:

- SQLite schema setup
- prepared statements
- game CRUD
- collections
- queue persistence
- recent downloads

### Frontend

`public\app.js` currently owns:

- local UI state
- search ranking
- filter cascade logic
- queue and collection UI wiring
- modal handling
- status polling

## Design notes

- Backend services are partially extracted, but route logic is still concentrated in `src\server.ts`.
- Frontend behavior is rich, but still lives in one large file.
- The application is designed for local single-user usage rather than multi-user deployment.
