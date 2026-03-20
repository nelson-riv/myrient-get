# Getting Started

## Requirements

- Node.js 18+
- npm
- Windows with PowerShell recommended for the current setup docs

## Install

```powershell
cd d:\Projects\myrient-get
npm install
```

## Configure environment

Copy the example file and set any values you need:

```powershell
Copy-Item .env.example .env
```

Useful variables:

- `THEGAMESDB_API_KEY` - enables TheGamesDB fallback metadata and box art
- `PORT` - overrides the default app port (`3001`)
- `HOST` - defaults to `127.0.0.1` for local-only access
- `LOG_LEVEL` - one of `debug`, `info`, `warn`, or `error`

## Start the app

```powershell
npm start
```

Open `http://localhost:3001` in your browser.

If port `3001` is already in use, update `PORT` in `.env` or use:

```powershell
$env:PORT=3002
npm start
```

## First-run flow

1. Open the app in the browser.
2. Click `Refresh Game List` to fetch the current Myrient catalog.
3. Wait for the initial fetch to finish.
4. Use search, platform, region, and revision filters to narrow the list.
5. Download directly or queue titles for background processing.

## Main areas of the app

- `Browse Games`: catalog search, filtering, queueing, downloads, metadata
- `Downloaded`: downloaded titles, recent downloads, collections
- `Settings`: cleanup, rebuild, reindex, status information

## Suggested next docs

- [User Guide](user-guide.md)
- [Quick Reference](quick-reference.md)
- [Windows Installation](windows-installation.md)
