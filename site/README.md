# sorack.com

Marketing site + documentation for [sorack](https://github.com/sdin99/sorack),
built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
and deployed to Cloudflare Pages.

- `/` — landing page (`src/pages/index.astro`)
- `/docs/*` — documentation (Starlight, `src/content/docs/docs/`)
- Theme tokens mirror the sorack app UI (`src/styles/sorack.css`).

This is a standalone npm project (kept out of the repo's pnpm workspace).

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # → dist/
```

## Deploy (Cloudflare Pages)

- Root directory: `site`
- Build command: `npm ci && npm run build`
- Build output: `dist`
