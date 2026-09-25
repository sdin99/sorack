# e2e

A browser, a build, and a Postgres. Three flows, two viewports.

## Why this exists

`ci` says the code is consistent. It does not say a person can use the thing.
`v0.1.4` shipped three faults that `ci`, the security scans and the hardening
gate all passed:

- the empty canvas offered no way to create a node,
- on a phone the only way in was a right-click, which does not exist there,
- the first-boot log said nothing about the admin account.

They were found by an operator spending ten minutes with it. This suite covers
the second one properly and the first as a side effect. It does not cover the
third, and no browser test would: that is a server log.

**What this catches is the regression of something we decided matters. It does
not catch the absence of something nobody thought of.** Most of what has gone
wrong here so far has been the second kind.

## Running it

You need sorack running somewhere and its admin password.

```bash
pnpm install --ignore-workspace     # ‼ the flag is not optional, see below
pnpm exec playwright install chromium

SORACK_E2E_URL=http://localhost:3001 \
SORACK_E2E_PASS=<the admin password> \
pnpm test
```

| variable | default |
|---|---|
| `SORACK_E2E_URL` | `http://localhost:3001` |
| `SORACK_E2E_USER` | `admin` |
| `SORACK_E2E_PASS` | `e2e-password-not-a-secret` |

‼ **The tests write.** `02-first-node` deletes every node before it runs, so
point this at a throwaway database, never at anything you care about. There is
no guard for that — the suite cannot tell your instance from a scratch one.

Serving over plain `http`? Start the app with `SORACK_COOKIE_SECURE=false`.
The default is `true`, the browser drops a secure cookie on an insecure
origin, and the result is that `POST /api/auth/login` returns `200` while
every request after it is `401` — with nothing on screen to say so.
`01-login` asserts the session is accepted for exactly this reason.

## ‼ `--ignore-workspace`

`pnpm install` run from this directory finds `pnpm-workspace.yaml` two levels
up, decides its scope is the whole repo, and offers to delete the repo-root
`node_modules`. On a machine where the app runs from a container sharing this
tree, that install is built for a different libc than the host and cannot be
recreated by rerunning the command.

`e2e` is deliberately not a member of the workspace: separate tool, separate
lifecycle, its own browser binaries. `scripts/guard-workspace.mjs` catches the
non-destructive half of this — a fresh clone, where pnpm proceeds silently.
It cannot catch the destructive half, because pnpm asks about the removal
before any lifecycle script runs.

## Conventions

**Never select on user-visible copy.** Every string in the app is translated,
and all of the settings copy was rewritten in one afternoon. A test anchored
to a sentence breaks on a copy change, and the usual response to that is to
loosen the test until it asserts nothing. Use `data-testid`, and add one to
the component when a flow needs a new hook.

**Assert what is true, not what is absent.** `toBeHidden()` passes for an
element that has not rendered yet, which right after a navigation means it
passes before the app has decided anything. The first version of the login
helper waited for the login form to disappear and reported success against an
instance where the session was being dropped on every request. It now asks
`/api/auth/me` and checks for a `200`.

**No conditional skips.** The first version of `02-first-node` skipped when
the map was not empty. The desktop project ran first and created a node, so
the mobile project — the viewport the test exists for — skipped, and the run
reported `11 passed, 1 skipped`. A test that can decline to run is a green
result meaning "did not look". It now resets the map itself.

## Does it work?

Both claims above were checked by breaking the thing on purpose:

- removing the empty-state button fails `02` on **both** projects,
- starting the app without `SORACK_COOKIE_SECURE=false` fails `01` with
  `session was not accepted by the server`.

If you add a test, do this. A test that has never failed has not been shown to
be looking at anything.
