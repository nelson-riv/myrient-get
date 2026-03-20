# Myrient Get

`myrient-get` is a local web application for browsing, filtering, organizing, and downloading selected game libraries sourced from Myrient.

It provides a browser-based interface for managing a local catalog, queueing downloads, and enriching entries with metadata from local LaunchBox data and optional TheGamesDB integration.

## Features

- Multi-platform library support
- Local ranked search with pagination
- Cascading platform, region, and revision filters
- Persistent download queue
- Collections and recent downloads
- SQLite-backed local storage
- Metadata enrichment and cached box art
- Health and metadata synchronization status

## Supported library sources

- Nintendo Game Boy Advance
- Nintendo 64
- Nintendo DS
- Nintendo 3DS
- Nintendo Entertainment System
- Super Nintendo Entertainment System
- Sony PlayStation
- Sony PlayStation 2
- Sony PlayStation Portable

## Requirements

- Node.js 18 or later
- npm
- Windows and PowerShell for the setup commands shown below

## Quick start

```powershell
cd d:\Projects\myrient-get
npm install
Copy-Item .env.example .env
npm start
```

Then open:

```text
http://127.0.0.1:3001
```

If port `3001` is already in use:

```powershell
$env:PORT=3002
npm start
```

## Environment variables

The application loads configuration from `.env`.

- `PORT` - overrides the default application port (`3001`)
- `HOST` - defaults to `127.0.0.1` for local-only access
- `LOG_LEVEL` - supported values are `debug`, `info`, `warn`, and `error`
- `THEGAMESDB_API_KEY` - enables TheGamesDB fallback metadata and box art

## Validation

```powershell
npm run build
npm run test:compliance
npm run test:fallback
npm run test:features
```

## Project structure

- `src/` - backend TypeScript source
- `public/` - browser UI assets
- `data/` - local database and cache data
- `downloads/` - downloaded library files
- `docs/` - project documentation

## Documentation

- [Documentation Index](docs/README.md)
- [Getting Started](docs/getting-started.md)
- [User Guide](docs/user-guide.md)
- [Quick Reference](docs/quick-reference.md)
- [Architecture Overview](docs/architecture.md)
- [Developer Guide](docs/developer-guide.md)
- [Myrient Compliance](docs/myrient-compliance.md)

## Notes

- This project is designed for local, single-user usage.
- Runtime data such as downloads, SQLite files, cached images, and local metadata are intentionally excluded from version control.
