---
title: Concepts
description: The two-axis node model, the topology graph, per-axis monitoring and runbooks.
---

sorack models your homelab with a few primitives that mirror how self-hosted
infrastructure actually behaves. Understanding them makes the rest of the app
obvious.

## Two-axis node model

Every node has two independent axes:

- An **infra type** — `host`, `vm`, `container`, `k8s_cluster`, `k8s_namespace`,
  `router`, and so on (the type is a free-form string, so you can add your own).
  This is what the thing *is*.
- Zero or more **software attachments** — Proxmox VE, PostgreSQL, Jellyfin, … —
  what *runs on* it.

Detail fields and monitoring slots **merge across both axes**. A Proxmox host,
for example, surfaces host-level fields from its infra type and PVE-specific
fields from its software attachment in the same panel.

## Topology + typed edges

The inventory *is* the graph. You create, rename, reparent and connect nodes
directly on the canvas, drawing **typed edges** between them. Layout is managed
automatically by [dagre](https://github.com/dagrejs/dagre), so cosmetic edits
never shuffle the picture — reparent a node or draw an edge and the graph
re-flows on its own.

## Per-axis monitoring

Each axis carries **one probe**. You can run a reachability probe on the infra
side and a Proxmox API probe on the software side at the same time.

When more than one axis reports, the **StatusLine** picks a primary aspect to
drive the node's status and exposes a pill row so you can switch between aspects.
Nodes without any probe are never touched, so manual status and automatic status
never clash — an unmonitored node simply stays `unknown`.

:::note
Status is collector-owned. There's no manual "set this to green" — if a node
isn't monitored, it reads `unknown` rather than showing a stale hand-set value.
:::

## Maintenance mode

Flag a node (and its subtree) as under maintenance and the collector skips it, so
intentional downtime doesn't read as a failure. The node shows a distinct
maintenance treatment instead of an error state.

## Runbooks

Runbooks are markdown documents linked to nodes. They render inside the app and
include an in-app split-view editor, `[[node:…]]` / `[[runbook:…]]` cross-links,
optional git sync, and file attachments. See your nodes from a runbook, and jump
to a node's runbooks from its detail panel.
