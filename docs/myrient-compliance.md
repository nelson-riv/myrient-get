# Myrient Compliance

This project includes request throttling and identification rules intended to stay aligned with Myrient best practices.

## Current protections

- minimum delay between Myrient requests: `500ms`
- explicit User-Agent header on Myrient requests
- directory-based source handling instead of raw file hotlinking workflows
- invalid parent-directory entries filtered out during scraping

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

- avoid repeatedly refreshing the full catalog when not needed
- prefer queued or normal in-app downloads over custom aggressive automation
- if Myrient behavior changes, review the current FAQ and adjust the request layer accordingly
