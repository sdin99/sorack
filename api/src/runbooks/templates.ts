// Built-in runbook templates. Returned by GET /api/runbooks/_templates and
// used by the inline "new runbook" panel as starting points. Each template is
// a partial RunbookRow shape — the create flow merges the user's chosen
// title on top before POSTing.
//
// These are TypeScript constants (not .md files) so they ship in the bundle
// and don't need a separate read path at boot. If a richer marketplace lands
// later, the same JSON shape will work for fetched-from-registry templates.

export interface RunbookTemplate {
  id: string;
  name: string;
  description: string;
  category: "task" | "sop" | "incident" | "postmortem" | "design_doc";
  summary: string;
  markdown: string;
}

export const TEMPLATES: RunbookTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Empty document, free-form.",
    category: "task",
    summary: "",
    markdown: "",
  },
  {
    id: "incident",
    name: "Incident response",
    description: "Severity / timeline / mitigation / RCA scaffold.",
    category: "incident",
    summary: "",
    markdown: [
      "## Severity & impact",
      "_What broke, who's affected, customer-visible?_",
      "",
      "## Timeline",
      "- HH:MM detected",
      "- HH:MM acknowledged",
      "- HH:MM mitigated",
      "- HH:MM resolved",
      "",
      "## Mitigation",
      "_Immediate steps taken to stop the bleed._",
      "",
      "## Root cause",
      "_What underlying condition allowed this._",
      "",
      "## Follow-ups",
      "- [ ] Action item",
    ].join("\n"),
  },
  {
    id: "postmortem",
    name: "Postmortem",
    description: "Blameless postmortem with timeline + lessons + action items.",
    category: "postmortem",
    summary: "",
    markdown: [
      "## Summary",
      "_One paragraph: what happened, impact, resolution._",
      "",
      "## Timeline",
      "- HH:MM event",
      "",
      "## What went well",
      "",
      "## What went badly",
      "",
      "## Where we got lucky",
      "",
      "## Action items",
      "- [ ] Owner — task",
    ].join("\n"),
  },
  {
    id: "sop",
    name: "SOP (procedure)",
    description: "Standard operating procedure with prerequisites + steps + verify.",
    category: "sop",
    summary: "",
    markdown: [
      "## Purpose",
      "_When and why to use this procedure._",
      "",
      "## Prerequisites",
      "- _Access / tooling / context required._",
      "",
      "## Procedure",
      "1. ",
      "",
      "## Verification",
      "_How to confirm the procedure succeeded._",
      "",
      "## Rollback",
      "_If anything went wrong, how to undo._",
    ].join("\n"),
  },
  {
    id: "adr",
    name: "Architecture decision",
    description: "ADR (Context / Decision / Consequences) — MADR-flavored.",
    category: "design_doc",
    summary: "",
    markdown: [
      "## Status",
      "proposed | accepted | superseded by [[runbook:adr-xxx]]",
      "",
      "## Context",
      "_What's the problem we're addressing and what forces are at play._",
      "",
      "## Decision",
      "_The choice we made, in active voice._",
      "",
      "## Alternatives considered",
      "- ",
      "",
      "## Consequences",
      "_Trade-offs accepted, follow-on work this implies._",
    ].join("\n"),
  },
];
