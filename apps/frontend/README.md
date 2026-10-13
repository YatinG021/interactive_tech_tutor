# Frontend

Next.js 16 (App Router) + Tailwind CSS 4 + Motion, built as a static export for GitHub Pages.

This app has its own `node_modules` and `package-lock.json` and is not part of the root npm workspace.

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" > .env.local
npm run dev        # http://localhost:3000
npm run build      # static site in out/
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL including `/api` |
| `NEXT_PUBLIC_BASE_PATH` | `/<repo>` when served as a GitHub Pages project site; empty locally |

Key places:
- `src/lib/simulation/renderer.ts`: the canvas renderer (connectors attach to shapes by `from`/`to` id)
- `src/lib/simulation/compose.ts` and `src/data/featured.ts`: the curated simulations
- `src/lib/narration.ts`: Sarvam narration with browser-voice fallback
- `src/components/learn/`: the player, tutor chat and practice panels
