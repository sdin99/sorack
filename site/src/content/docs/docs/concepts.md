---
title: Concepts
description: The two-axis node model, the topology graph, per-axis monitoring and runbooks.
---

sorack models a homelab with a few building blocks. This page describes each
one.

## Two-axis node model

Every node has two independent axes:

- An **infra type**, such as `host`, `vm`, `container`, `k8s_cluster`,
  `k8s_namespace`, or `router`. It describes what the node is. You choose it
  from a [fixed list](/docs/nodes/). The type decides which fields the detail
  panel shows; a type sorack does not recognize shows an empty panel instead of
  an error.
- Zero or more **software attachments**, such as Proxmox VE, PostgreSQL, or
  Jellyfin. They describe what runs on the node.

Detail fields and monitoring slots from both axes appear together. For
example, a Proxmox host shows host fields from its infra type and PVE fields
from its software attachment in the same panel.

## Topology + typed edges

The inventory is the graph. You create, rename, move, and connect nodes
directly on the canvas, and draw **typed edges** between them.
[dagre](https://github.com/dagrejs/dagre) lays out the graph automatically.
Renaming a node does not move anything; moving a node or drawing an edge
re-flows the graph.

## Per-axis monitoring

Each axis has one probe. For example, you can run a reachability probe on the
infra axis and a Proxmox API probe on the software axis at the same time.

When more than one axis reports, the **StatusLine** picks one aspect to set the
node's status and shows a row of pills for switching between aspects. The
collector does not change nodes that have no probe, so manual and automatic
status never conflict.

### “not monitored” is not “unknown”

The UI shows these two states differently:

| Shows | Meaning |
| --- | --- |
| **not monitored** | No probe is configured on any axis. |
| `unknown` | A probe ran but could not decide, for example after a timeout, a 403, or when a job's history has been cleaned up. |

A node that shows **not monitored** is a gap in your monitoring. A node that
shows `unknown` has a probe that needs attention.

sorack derives `monitored` from the node's probe configuration and does not
store it, so the value is always current. If a sync leaves a node unmonitored
on purpose, it can record the reason in
[`meta.probeSkipped`](/docs/nodes/#keys-a-sync-writes).

:::note
Only the collector sets status. You cannot set a node to green by hand; a node
without a probe shows **not monitored**.
:::

## Maintenance mode

Mark a node as under maintenance and the collector skips it and its subtree.
Planned downtime then does not show as a failure. The node shows a maintenance
state instead of an error.

## Runbooks

Runbooks are Markdown documents linked to nodes. The app renders them and
includes a split-view editor, `[[node:…]]` and `[[runbook:…]]` links, optional
git sync, and file attachments. A runbook shows the nodes it links to, and a
node's detail panel links to its runbooks.
