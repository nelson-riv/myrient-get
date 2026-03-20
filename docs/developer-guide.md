# Developer Guide

## Local development

### Install

```powershell
npm install
```

### Environment

The app loads `.env` automatically with `dotenv`.

```powershell
Copy-Item .env.example .env
```

Supported variables:

- `PORT`
- `HOST`
- `LOG_LEVEL`
- `THEGAMESDB_API_KEY`

### Run

```powershell
npm run dev
```

### Build

```powershell
npm run build
```

## Validation commands

```powershell
npm run test:compliance
npm run test:fallback
npm run test:features
```

## Important files

- `src\server.ts` - main API surface and runtime orchestration
- `src\db-service.ts` - SQLite persistence layer
- `src\thegamesdb-service.ts` - fallback metadata service
- `src\launchbox-service.ts` - LaunchBox metadata indexing
- `src\myrient-sources.ts` - source catalog
- `public\app.js` - client-side state and rendering

## Feature areas

### Backend

- queue lifecycle endpoints
- collections endpoints
- health and metadata sync endpoints
- background metadata sync
- download cancellation and queue pause/resume

### Frontend

- ranked local browse search
- hierarchical filter counts
- queue management panel
- collections UI
- recent downloads
- service status display

## Current engineering priorities

- split `public\app.js` into modules
- split route handlers out of `src\server.ts`
- standardize on `logger` across services
- add more endpoint-level automated coverage

## Documentation convention

All maintained project docs now live under `docs\`.
