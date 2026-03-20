# TypeScript Migration Notes

The backend has been migrated to TypeScript and now builds into `dist\`.

## Current status

- TypeScript backend source lives in `src\`
- compiled output is emitted to `dist\`
- frontend remains plain browser JavaScript in `public\`

## Useful scripts

```powershell
npm run build
npm run dev
npm run watch
```

## Shared type modules

The original in-file type definitions were refactored into shared modules such as:

- `src\app-types.ts`
- `src\validation.ts`
- `src\myrient-sources.ts`

## Practical note

The migration is complete enough for day-to-day development, but `src\server.ts` and `public\app.js` are still the largest refactoring candidates.
