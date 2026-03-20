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

Shared backend definitions now live in modules such as:

- `src\app-types.ts`
- `src\validation.ts`
- `src\myrient-sources.ts`

## Current state

The migration is complete for day-to-day development. The largest remaining refactoring targets are `src\server.ts` and `public\app.js`, which still contain a significant amount of application logic.
