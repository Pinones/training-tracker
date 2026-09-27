# Training Tracker

Local-first training PWA. See [plan.md](plan.md) for the full spec.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 (service worker disabled in dev)
npm test           # Vitest: training logic in src/logic/
npm run build      # strict typecheck + production build with service worker
npm run preview    # serve the production build (test the PWA here)
npm run icons      # regenerate placeholder icons in public/
```

## Layout

- `src/logic/` — pure, unit-tested training logic (rotation, progression, bodyweight, formatting)
- `src/db/` — Dexie (IndexedDB) schema mirroring the Supabase tables, plus the outbox
- `src/sw.ts` — custom service worker (injectManifest)
- `src/strings.ts` — all UI text

## Deploy (Vercel)

Vercel auto-detects Vite: build command `npm run build`, output directory `dist`.
`vercel.json` rewrites deep links to `index.html` and stops `sw.js` from being cached.
