# sorack.com

Marketing site + documentation for [sorack](https://github.com/sdin99/sorack),
built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
and deployed to Cloudflare Pages.

- `/` and `/ko/` — landing page, English and Korean. Both render
  `src/components/Landing.astro`; the only difference is the strings in
  `src/i18n/landing.ts`. The build fails if a key is missing in either language.
  Keep markup out of those strings: the component's CSS is scoped and does not
  reach markup injected with `set:html`.
- `/docs/*` — documentation in English (Starlight, `src/content/docs/docs/`)
- `/ko/docs/*` — the same documentation in Korean (`src/content/docs/ko/docs/`)
- Theme tokens mirror the sorack app UI (`src/styles/sorack.css`).

This is a standalone npm project (kept out of the repo's pnpm workspace).

## ‼ Pushing to `main` publishes

Cloudflare Pages builds from this repository directly — there is no deploy
workflow to gate it. A commit that touches `site/` is live within a couple of
minutes. Treat a docs edit as a publish, not as a draft.

CI builds the site and runs two checks against it (`scripts/check-docs-links.py`
and `scripts/check-docs-translations.py`), but those run *with* the push, not
before it.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # → dist/
```

## Editing the docs

English is the source. It lives at the root (`/docs/...`) and the Korean
translation sits under `/ko/`; the `defaultLocale: 'root'` in
`astro.config.mjs` is what keeps English there, and changing it would move
every existing English URL.

When you change an English page, change its Korean counterpart in the **same
commit**. The check passes when both files were last touched by one commit, so
that is the path of least resistance and it needs no bookkeeping.

If you have re-read a translation and it is still correct without an edit, say
so in its frontmatter instead:

```yaml
---
title: 개념
# the English page's current last commit, in full — a prefix can later
# match a different commit
sourceCommit: 4a67ea884178eb4f657beacbd68a98a36c2b4b05
---
```

`git log -1 --format=%H -- site/src/content/docs/docs/<page>.md` prints it, and
so does the check when it fails.

### What that check does and does not do

It compares commits. It does not read the Korean.

`sourceCommit` can be bumped without changing a word of the translation, and
the check will pass. So it does not guarantee the translation is current — it
makes the *claim* explicit and dateable. Today, with no claim at all, a
translation can fall behind and produce no symptom of any kind; that is what
this replaces, and it is a smaller thing than it might look like.

Two related traps it exists because of:

- **A missing Korean page is not a missing page.** Starlight serves the English
  content at the Korean URL, with `lang="ko"` on the English text and no notice
  of any kind. Measured on the built output: `/ko/docs/concepts/` returned the
  complete English page, and the only Korean strings on it were the navigation
  chrome. An untranslated page presents as a translated one — which is why the
  check requires the file to exist rather than only comparing the ones that do.
- **A shallow clone makes the check meaningless, not noisy.** Per-file "last
  commit" collapses to the single commit present, so every page matches and the
  run is green. The script refuses to run on a shallow clone; the CI job sets
  `fetch-depth: 0`.

Anchors are generated from heading text, so Korean headings have Korean
anchors. A link copied from an English page keeps the English fragment, looks
correct, and resolves to nothing — `check-docs-links.py` catches that, but only
against a build, so build before running it.

## Deploy (Cloudflare Pages)

- Root directory: `site`
- Build command: `npm ci && npm run build`
- Build output: `dist`
