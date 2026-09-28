---
title: Node types & meta
description: The type vocabulary a node may take, and who owns each key under meta.
---

A node has a `type` and a `meta` object. The type decides which fields the
detail panel shows. `meta` holds data written by you, by the collector, and by
any tool that syncs an inventory into sorack. This page is the reference for
both. It is most useful if you are writing a tool that calls
[`/api/nodes`](/docs/api/).

## The type vocabulary

`type` must be one of the values below. The API rejects any other value with a
400 error whose message lists the accepted types.

| `type` | Use for | Default probe |
| --- | --- | --- |
| `host` | A physical or bare-metal machine. | `system` |
| `vm` | A virtual machine on a hypervisor. | `system` |
| `container` | An OS-level container, such as LXC. | `system` |
| `router` | The gateway between your LAN and the internet. | `tcp` |
| `k8s_cluster` | A Kubernetes cluster. | `k8s` |
| `k8s_namespace` | A namespace that groups workloads. | `k8s` |
| `k8s_service` | A Service that exposes pods. | `k8s` |
| `k8s_pvc` | A PersistentVolumeClaim. | `k8s` |
| `k8s_cronjob` | A scheduled batch job. | `k8s` |
| `external_service` | A service you depend on but do not run. | `http` |
| `hosted_app` | An app you deploy and maintain that runs on another provider's platform. | `http` |
| `share` | A network file share (NFS, SMB). | `tcp` |

sorack also accepts four short forms: `ct` (`container`), `ns`
(`k8s_namespace`), `pvc` (`k8s_pvc`), and `svc` (`k8s_service`). They are not
separate types. The detail panel and the type picker treat them as the full
type.

### Choosing between similar types

**`external_service` or `hosted_app`.** Choose by whether you can change it,
not by where it runs. A function you deploy and patch is a `hosted_app`, even
though another provider runs it. The provider's platform itself is an
`external_service`. Do not use `host` for a third-party service: its `ip`,
`os`, `kernel`, and `uptime` fields would always be empty.

**`k8s_service` or `k8s_cronjob`.** A CronJob has no cluster IP, ports,
selector, or endpoints, so the Service fields do not apply. The CronJob type
shows `schedule`, `lastScheduleTime`, `lastSuccessfulTime`, `lastStatus`, and
`suspend`. sorack [reports these values but does not grade
them](/docs/adapters/#kubernetes).

## `meta`

`meta` is a free-form object. Its keys fall into three groups, depending on who
writes them. Each group should have only one writer.

| Group | Written by | Example keys |
| --- | --- | --- |
| Your fields | You, in the UI or through the API | `role`, `ip`, `provider`, `software` |
| Observations | The collector, on every check | Everything under `observed.*` |
| Sync annotations | A tool that syncs an inventory into sorack | `syncedBy`, `probeSkipped`, `adr` |

Two rules apply to both `POST` and `PATCH`:

- A `null` value deletes the key. sorack does not store `null`.
- `observed` is ignored. Only the collector writes observations.

`PATCH` merges `meta` instead of replacing it, so send only the keys you want
to change. How deep the merge goes depends on the key:

| Key | On `PATCH` |
| --- | --- |
| `manual`, `softwareProbes` | Merged one level deeper. Other entries are kept. |
| `observed` | Ignored. The stored value is kept. |
| Any other key | Replaced as a whole. |

For example, `{"meta":{"manual":{"ip":"10.0.0.2"}}}` changes `ip` and keeps the
other manual fields. `{"meta":{"adr":[…]}}` replaces the whole array.

`POST` and `PATCH` both return the node with the stored fields and a
`monitored` boolean that sorack computes.

### Keys a sync writes

These three keys let a tool that manages nodes from another source of truth
explain itself in the UI. All three are optional. They are ordinary `meta`
keys, so you can also set them by hand.

**`syncedBy`** is a string that names the tool that wrote the node.

```jsonc
{ "meta": { "syncedBy": "inventory-sync" } }
```

The detail panel shows *from inventory-sync* next to the values the tool wrote.
The tooltip says that edits made there may be replaced on the tool's next run.
The fields remain editable.

**`probeSkipped`** is a string that explains why a node has no probe.

```jsonc
{ "meta": { "probeSkipped": "behind an identity proxy; 200 means the proxy" } }
```

A node can be [**not monitored**](/docs/concepts/#not-monitored-is-not-unknown)
because nobody has set up a probe yet, or because a probe would give a wrong
answer. `probeSkipped` records the second case. It appears next to the
*not monitored* label and nowhere else, so a monitored node never shows it.

**`adr`** is an array of decision records that explain why the node exists.

```jsonc
{
  "meta": {
    "adr": [
      { "id": "ADR-014", "title": "One namespace per app", "url": "https://…" }
    ]
  }
}
```

`id` is required. If `title` is missing, the `id` is shown instead. `url` is
shown as a link only if it starts with `http://` or `https://`.

sorack stores links only, not the reasoning itself. Keep the decision record in
the repository where it is written and reviewed.

If the array is empty, the detail panel does not show the "Related decisions"
section.

:::note
sorack stores keys it does not recognize and returns them unchanged, so you can
keep your own data in `meta`. A misspelled key is not an error, so check the
detail panel after your first write.
:::
