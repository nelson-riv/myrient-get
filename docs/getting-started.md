# Getting Started

## Requirements

- Node.js 18+
- npm
- Windows and PowerShell are used in the examples below

## Installation

```powershell
cd d:\Projects\myrient-get
npm install
```

## Environment configuration

Create a local environment file from the example:

```powershell
Copy-Item .env.example .env
```

Supported variables:

- `THEGAMESDB_API_KEY` - enables TheGamesDB fallback metadata and box art
- `PORT` - overrides the default application port (`3001`)
- `HOST` - defaults to `127.0.0.1` for local-only access
- `LOG_LEVEL` - supported values are `debug`, `info`, `warn`, and `error`

## Start the application

```powershell
npm start
```

Open `http://127.0.0.1:3001` in your browser.

If port `3001` is already in use, update `PORT` in `.env` or use:

```powershell
$env:PORT=3002
npm start
```

## Initial workflow

1. Open the app in the browser.
2. Click `Refresh Game List` to fetch the current Myrient catalog.
3. Wait for the initial fetch to finish.
4. Use search, platform, region, and revision filters to narrow the list.
5. Download directly or queue titles for background processing.

## Main application areas

- `Browse Games`: catalog search, filtering, queueing, downloads, metadata
- `Downloaded`: downloaded titles, recent downloads, collections
- `Settings`: cleanup, rebuild, reindex, status information

## Related documentation

- [User Guide](user-guide.md)
- [Quick Reference](quick-reference.md)
- [Windows Installation](windows-installation.md)
