# Myrient Compliance

This project includes request throttling and identification rules intended to stay aligned with Myrient best practices.

## Current protections

- minimum delay between Myrient requests: `500ms`
- explicit `User-Agent` header on Myrient requests
- directory-based source handling rather than raw file hotlinking
- invalid parent-directory entries filtered during scraping

## Key implementation points

The Myrient request logic currently lives in `src\server.ts` and applies the same delay guard before:

- catalog fetch operations
- direct downloads
- queued downloads

## User-Agent

```text
Myrient-Get/1.0 (+https://github.com/myrient-get)
```

## Operational guidance

- avoid repeatedly refreshing the full catalog when not required
- prefer the built-in queue and download workflows over custom automation
- review Myrient guidance periodically and adjust the request layer if requirements change
