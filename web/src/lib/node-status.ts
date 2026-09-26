// One place that turns a node into a dot and a word.
//
// There were three: the map card had a STATUS_COLOR table and the sidebar
// tree had the same ternary written out twice. Three copies of one decision
// is how the map and the tree end up disagreeing about the same node.
//
// ‼ `unknown` was doing two jobs. A probe that ran and could not decide — a
// 403, a timeout, a CronJob whose Job was cleaned up — is something to look
// into. A node with no probe at all is something to set up. Both were grey,
// and on an install where most nodes have no probe yet, grey stops carrying
// information: five of nine on the infra team's map sat unknown forever.
export type NodeTone = "ok" | "warn" | "err" | "unknown" | "unmonitored";

export function nodeTone(node: { status?: string; monitored?: boolean } | null | undefined): NodeTone {
  if (!node) return "unknown";
  // Only `unknown` splits. A node with no probe cannot be ok/warn/err — but
  // if it somehow carries one (a probe removed after the last sweep, say),
  // the recorded judgement is still the more informative answer, and calling
  // it "not monitored" would throw that away.
  if (node.status === "unknown" && node.monitored === false) return "unmonitored";
  return (node.status as NodeTone) ?? "unknown";
}

// --fg-4 for unmonitored, --fg-3 for unknown: dimmer than a real answer, and
// distinguishable from one. Both stay grey on purpose — neither is a state
// anyone should be drawn to, and using a colour would put them in competition
// with err and warn.
const TONE_COLOR: Record<NodeTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
  unknown: "var(--fg-3)",
  unmonitored: "var(--fg-4)",
};

export function toneColor(tone: NodeTone): string {
  return TONE_COLOR[tone];
}

export function nodeToneColor(node: { status?: string; monitored?: boolean } | null | undefined): string {
  return toneColor(nodeTone(node));
}
