# Quick Reference

## Start the application

```powershell
cd d:\Projects\myrient-get
npm install
npm start
```

Open `http://127.0.0.1:3001`.

## Build and validation

```powershell
npm run build
npm run test:compliance
npm run test:fallback
npm run test:features
```

## Override the default port

```powershell
$env:PORT=3002
npm start
```

## Important folders

- `src\` - backend TypeScript source
- `public\` - browser UI
- `data\` - SQLite database and cache data
- `downloads\` - downloaded games
- `docs\` - project documentation

## Key API endpoints

### Library and search

- `POST /api/fetch-games`
- `GET /api/games`
- `GET /api/search?q=...`
- `GET /api/stats`

### Downloads

- `POST /api/download`
- `POST /api/cancel-download`
- `GET /api/downloaded`
- `GET /api/recent-downloads`
- `GET /api/queue`
- `POST /api/queue`
- `POST /api/queue/:queueId/pause`
- `POST /api/queue/:queueId/resume`
- `DELETE /api/queue/:queueId`

### Collections

- `GET /api/collections`
- `POST /api/collections`
- `GET /api/collections/:id/games`
- `POST /api/collections/:id/games`
- `DELETE /api/collections/:id/games/:gameId`
- `DELETE /api/collections/:id`

### Metadata and status

- `POST /api/fetch-metadata`
- `POST /api/launchbox-metadata`
- `GET /api/thegamesdb-search`
- `GET /api/fetch-box-art`
- `POST /api/save-box-art`
- `GET /api/metadata-stats`
- `GET /api/metadata-sync-status`
- `GET /api/health`

## Common issues

- Port already in use: start with another `PORT`
- Missing dependencies: run `npm install`
- Broken local state: rebuild or reindex from Settings
- Slow initial catalog load: expected during the first Myrient import
