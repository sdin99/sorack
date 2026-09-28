---
title: Node types & meta
description: The type vocabulary a node may take, and who owns each key under meta.
---

A node has a `type` and a bag of `meta`. Both are contracts: the type decides
which fields the detail panel renders, and `meta` is shared between you, the
collector and anything syncing an inventory in. This page is the reference for
both — most useful if you are writing something that POSTs to
[`/api/nodes`](/docs/api/).

## The type vocabulary

`type` is validated against a closed list. It was a free string until v0.1.12,
and the failure that closed it is worth knowing, because it is the failure this
page exists to prevent: a sync sent its own words — `app`, `ingress` — and the
nodes landed with a generic icon and a detail panel containing no fields,
because the renderer looks the type up in a table with no such key. Nothing
errored. The only symptom was on screen.

| `type` | What it is for | Default probe |
| --- | --- | --- |
| `host` | A physical or bare-metal machine. | `system` |
| `vm` | A virtual machine on a hypervisor. | `system` |
| `container` | An OS-level container (e.g. LXC). | `system` |
| `router` | The gateway between your LAN and the internet. | `tcp` |
| `k8s_cluster` | A Kubernetes cluster. | `k8s` |
| `k8s_namespace` | A namespace grouping workloads. | `k8s` |
| `k8s_service` | A Service exposing pods. | `k8s` |
| `k8s_pvc` | A PersistentVolumeClaim. | `k8s` |
| `k8s_cronjob` | A scheduled batch job. | `k8s` |
| `external_service` | Something you depend on and do not run. | `http` |
| `hosted_app` | Yours, deployed by you, on someone else's platform. | `http` |
| `share` | A network file share (NFS, SMB). | `tcp` |

Four short forms are accepted and resolve to the canonical type: `ct` →
`container`, `ns` → `k8s_namespace`, `pvc` → `k8s_pvc`, `svc` →
`k8s_service`. They are aliases, not separate types — the detail panel and the
picker show the canonical card.

Anything else is rejected with a 400 whose message lists the accepted types.

### Two pairs that are easy to get wrong

**`external_service` vs `hosted_app`.** The line is *whether you can fix it*,
not where it runs. A function you deploy and patch is a `hosted_app` even
though someone else's platform runs it; the platform underneath is an
`external_service`. Typing a third-party service as `host` puts it among your
own machines and leaves `ip`, `os`, `kernel` and `uptime` permanently blank —
and empty fields are how a wrong type shows itself.

**`k8s_service` vs `k8s_cronjob`.** A CronJob has no clusterIP, no ports, no
selector and no endpoints, so the Service card describes nothing about one.
The CronJob card carries `schedule`, `lastScheduleTime`, `lastSuccessfulTime`,
`lastStatus` and `suspend` instead — and is
[reported rather than graded](/docs/adapters/#kubernetes).

## `meta`

`meta` is a free-form object with three groups of keys in it, separated by who
writes them. The separation is the point: when two writers own one fact, they
diverge, and the older of the two wins at random.

| Group | Written by | Example keys |
| --- | --- | --- |
| Your fields | You, in the UI or over the API | `role`, `ip`, `provider`, `software` |
| Observations | The collector, on every sweep | everything under `observed.*` |
| Sync annotations | Whatever syncs an inventory in | `syncedBy`, `probeSkipped`, `adr` |

Two rules apply on the way in, to both `POST` and `PATCH`:

- **`null` means "delete this key"**, not "store a null". The UI sends it to
  clear a field; a sync sends it to say "no reason this time". Storing the null
  would leave behind a fact nothing reads and everything has to step over —
  and since a null and an absent key render identically, the only visible
  symptom was `meta` slowly filling up.
- **`observed` is refused.** It belongs to the collector. A caller could
  otherwise seed a node with observations nothing observed, and on a node with
  no probe that would never be corrected.

`PATCH` merges rather than replaces, so send only the keys you are changing.
The depth of the merge differs by key, which is worth knowing before you write
a sync:

| Key | On `PATCH` |
| --- | --- |
| `manual`, `softwareProbes` | Merged one level deeper — sibling entries survive. |
| `observed` | Ignored; the stored bag is kept. |
| everything else | Replaced wholesale at the top level. |

So `{"meta":{"manual":{"ip":"10.0.0.2"}}}` changes `ip` and leaves the other
manual fields alone, while `{"meta":{"adr":[…]}}` replaces the whole array.

Both `POST` and `PATCH` hand back the node with a derived `monitored` boolean
alongside the stored fields.

### Keys a sync writes

Three keys exist so that something maintaining nodes from an external source
of truth can explain itself in the UI. All three are optional, and all three
are ordinary `meta` keys — nothing stops you setting them by hand.

`syncedBy` — a string naming what wrote the node.

```jsonc
{ "meta": { "syncedBy": "inventory-sync" } }
```

The detail panel shows *from inventory-sync* next to the values it wrote, with
a tooltip saying edits here may be replaced on its next run. The wording is
deliberate: the fields stay editable, so claiming they cannot be changed would
be false and the operator would find out the hard way.

`probeSkipped` — a string explaining why a node has no probe.

```jsonc
{ "meta": { "probeSkipped": "behind an identity proxy; 200 means the proxy" } }
```

[**not monitored**](/docs/concepts/#not-monitored-is-not-unknown) covers two
very different situations: nobody has got to it yet, and a probe here would
lie. This tells them apart. It renders next to the *not monitored* label and
nowhere else — a node that *is* monitored never shows it.

`adr` — an array of decision records, for why the node is there at all.

```jsonc
{
  "meta": {
    "adr": [
      { "id": "ADR-014", "title": "One namespace per app", "url": "https://…" }
    ]
  }
}
```

`id` is required; `title` falls back to the `id`, and `url` renders as a link
only when it is `http(s)` — a dead anchor claims the decision is one click away
when it is not, and the repository holding these is often private.

Links only, on purpose: there is no field in sorack for the reasoning itself.
The decision belongs in the repository that owns it and reviews it, and a text
box here would be a second home for the same fact.

The section hides itself when the list is empty, rather than showing an empty
"Related decisions" heading — which reads as *there are none* when it almost
always means nobody has linked them yet.

:::note
Keys the app does not recognise are stored and handed back untouched. That is
what makes `meta` usable as a place to hang your own data — but it also means
a typo is not an error, so check the detail panel after the first write.
:::
