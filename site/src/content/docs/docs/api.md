---
title: API keys
description: Calling the sorack api from a script with a bearer key.
---

Everything the web UI does goes through `/api/*`. A script can do the same
with an API key, which is what you want for a reconciler, a sync job, or
anything else that is not a person with a browser.

## Issue a key

Settings → **API keys** → *New key*. Pick a scope, give it a name you will
recognise in six months, and copy the value — it is stored as
`sha256(key + AUTH_SECRET)` and cannot be shown again.

Keys are issued from a logged-in session only. A key cannot create or revoke
another key: otherwise revoking the one you know about would not actually
revoke access.

## Send it

```bash
curl -H "Authorization: Bearer $SORACK_API_KEY" \
     https://sorack.example.com/api/inventory
```

## Scopes

| scope | may do |
|---|---|
| `read` | `GET`, `HEAD`, `OPTIONS` |
| `write` | everything the api exposes |

The guard is keyed on the HTTP method, not on a list of routes, so a route
added later is covered without anyone remembering to add it.

`POST /api/nodes/:id/probe/test` needs `write` even though it changes nothing
stored: it opens a connection to an operator-supplied address, which is not
something a read-only key should be able to trigger.

## Telling the two failures apart

```
401  {"error":"unauthorized"}
403  {"error":"this API key is read-only","scope":"read"}
```

`401` means the key is absent, malformed, or revoked — issue a new one. `403`
means the key is valid and not allowed to do this — fix the configuration. A
client that retries on both will loop forever on the second, so branch on the
status before retrying.

## Checking that requests arrive at all

Each successful verification records `lastUsedAt`, shown in Settings next to
the key. If a key you have just wired up still reads *never used*, the request
is not reaching sorack — something in front of it is answering. An identity
proxy that returns its login page with `200` is the usual cause, and it looks
like a working request to most clients.

## Notes for callers

- Keys do not expire. Revocation is the only way out, which is why
  `lastUsedAt` exists: check it before deleting one.
- Validation errors are `400` and name the field. A `409` means a duplicate —
  for nodes that is the id, for edges the `(source, target, type)` triple.
- Keys issued before the rename from "API tokens" begin with `sorack_pat_`
  instead of `sorack_key_`. Both are accepted; only the latter is issued.
