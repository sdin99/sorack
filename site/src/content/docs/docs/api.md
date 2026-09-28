---
title: API keys
description: Calling the sorack api from a script with a bearer key.
---

Everything the web UI does goes through `/api/*`. Scripts can call the same
API with an API key. Use a key for sync jobs, reconcilers, and other tools that
run without a person at a browser.

## Issue a key

Go to **Settings → API keys** and select **New key**. Choose a scope, give the
key a name you will recognize later, and copy the value. sorack stores only
`sha256(key + AUTH_SECRET)`, so the value cannot be shown again.

You can create keys only from a signed-in session. A key cannot create or
revoke other keys.

## Send it

```bash
curl -H "Authorization: Bearer $SORACK_API_KEY" \
     https://sorack.example.com/api/inventory
```

## Scopes

| Scope | Allows |
|---|---|
| `read` | `GET`, `HEAD`, `OPTIONS` |
| `write` | Every API operation |

Scopes are checked by HTTP method, not by a list of routes, so new routes are
covered automatically.

`POST /api/nodes/:id/probe/test` requires `write` even though it does not change
stored data, because it opens a connection to an address supplied by the
caller.

## Telling the two failures apart

```
401  {"error":"unauthorized"}
403  {"error":"this API key is read-only","scope":"read"}
```

`401` means the key is missing, malformed, or revoked, or that
`SORACK_AUTH_SECRET` has changed since the key was created (see
[Configuration](/docs/configuration/#auth)); create a new key. `403`
means the key is valid but its scope does not allow the request; change the
scope or use a different key. Do not retry on `403`: the result will not
change.

## Checking that requests arrive at all

Each successful request updates the key's **last used** time, shown next to
the key in Settings. If a key you just set up still shows *never used*, your
requests are not reaching sorack. A common cause is an identity proxy in front
of sorack that returns its login page with status `200`, which most clients
treat as success.

## Attaching software to a node

Software that runs on a host or VM is not a separate node. It is stored on the
node it runs on, in `meta.software` (the list of software ids) and
`meta.softwareProbes` (the probe for each one). Set both with a `PATCH` to the
node:

```bash
curl -X PATCH .../api/nodes/k8s-master -H 'content-type: application/json' -d '{
  "meta": {
    "software": ["containerd", "kubelet", "cnpg"],
    "softwareProbes": { "cnpg": { "type": "tcp", "host": "10.0.0.10", "port": 5432 } }
  }
}'
```

`PATCH` merges `meta`, so keys you do not send are kept. Two exceptions matter
for scripts:

- `meta.software` is an array and is replaced as a whole.
- When you send `meta.software`, sorack deletes the probes of any software not
  in the new list. This matches the UI, where unchecking software also removes
  its probe and collected metrics.

Because of this, one `PATCH` per software item does not add up. For example,
sending `{"software":["containerd"],…}` and then `{"software":["kubelet"],…}`
leaves only `kubelet`, with no error. Send the complete list for a node in a
single `PATCH`.

You do not need to send `meta.observed.*`. The collector owns it, and sorack
keeps the stored value on every write.

## Notes for callers

- Keys do not expire. To stop using one, revoke it. Check its **last used**
  time before you revoke it.
- Validation errors return `400` and name the field. `409` means a duplicate:
  the id for nodes, or the `(source, target, type)` combination for edges.
- Keys created before this feature was renamed from "API tokens" start with
  `sorack_pat_`. New keys start with `sorack_key_`. Both are accepted.
