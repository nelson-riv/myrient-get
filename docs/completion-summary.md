# Project Status

## Current capabilities

- multi-platform Myrient catalog support
- SQLite-backed storage
- improved browse performance with local search and pagination
- metadata enrichment through LaunchBox and optional TheGamesDB fallback
- persistent queue, collections, and recent downloads
- service health and metadata synchronization visibility
- targeted validation scripts for core and feature workflows

## Repository documentation

Project documentation is maintained under `docs\` so the repository root can remain focused on source code and runtime assets.

## Validation baseline

The current validation baseline includes:

- `npm run build`
- `npm run test:compliance`
- `npm run test:fallback`
- `npm run test:features`
- syntax checks for browser and validation scripts
