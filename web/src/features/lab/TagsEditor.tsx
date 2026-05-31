// NodeDetail tag chip row + inline add input with autocomplete from the pool
// of tags already used on other nodes.
//
// Tags are stored at node.tags (a string[] column, see schema). Hybrid format:
// a bare label or "key:value". Parsing happens at search/filter time
// (lib/tag-color.parseTag), never on write — what the operator types is what
// gets stored, modulo trim.
//
// Input flow:
//   - Click "+ tag" → input opens, suggestion list shows tags currently used
//     elsewhere (and not already on this node).
//   - Type → list filters by substring; Arrow ↑/↓ navigates; Enter commits the
//     highlighted suggestion (or raw draft if nothing highlighted); comma
//     also commits (multi-add stays linear).
//   - Click a suggestion (mouseDown) = commit that tag.
//   - Esc or click outside = close without committing the draft. (Enter is
//     the only "save typed value" action — keeps "click away" predictable.)
//
// Suggestion pool excludes tags already on the current node, and "currently
// in use" means appearing on at least one other node right now: a tag that
// was removed from every node disappears from the pool. That matches the
// user's mental model (autocomplete = what's available today).

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TagChip } from "@/components/TagChip";
import { useSorack } from "@/lib/data-source/SorackData";

interface TagsEditorProps {
  node: any;
  updateNode: (id: string, patch: any) => Promise<any>;
}

export function TagsEditor({ node, updateNode }: TagsEditorProps) {
  const { t } = useTranslation();
  const { NODES } = useSorack();
  const tags: string[] = node?.tags ?? [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [highlight, setHighlight] = useState(-1);

  // Pool of tags available for autocomplete: every tag currently on any other
  // node, minus the ones this node already has. Deduplicated, sorted alpha.
  // Keyed by tags.join so it recomputes when the current node's tag set
  // changes (a removed tag should immediately reappear as a suggestion).
  const pool = useMemo(() => {
    const have = new Set(tags);
    const set = new Set<string>();
    for (const n of Object.values(NODES) as any[]) {
      if (n?.id === node?.id) continue;
      const ns = (n?.tags ?? []) as string[];
      for (const tagVal of ns) if (!have.has(tagVal)) set.add(tagVal);
    }
    return Array.from(set).sort();
  }, [NODES, node?.id, tags.join(",")]);

  // Filtered by draft substring (case-insensitive). Empty draft = full pool.
  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((tagVal) => tagVal.toLowerCase().includes(q));
  }, [pool, draft]);

  const closeInput = () => { setEditing(false); setDraft(""); setHighlight(-1); };

  const commit = async (raw: string) => {
    const v = raw.trim();
    if (!v) { closeInput(); return; }
    if (tags.includes(v)) { closeInput(); return; }
    try {
      await updateNode(node.id, { tags: [...tags, v] });
    } catch (e) { console.error("add tag failed:", e); }
    closeInput();
  };

  const remove = async (target: string) => {
    try {
      await updateNode(node.id, { tags: tags.filter((x) => x !== target) });
    } catch (e) { console.error("remove tag failed:", e); }
  };

  return (
    <div className="nd-tags">
      {tags.map((tag) => (
        <TagChip key={tag} value={tag} onRemove={() => remove(tag)} />
      ))}
      {editing ? (
        <div className="nd-tags-edit">
          <input
            autoFocus
            className="nd-tags-input"
            value={draft}
            placeholder={t("nd.tagPlaceholder", { defaultValue: "env:prod, role:db, …" })}
            onChange={(e) => {
              const v = e.target.value;
              // Comma commits the current value and stays in input mode for
              // the next tag — handy for batch entry.
              if (v.endsWith(",")) {
                const piece = v.slice(0, -1);
                commit(piece);
              } else {
                setDraft(v);
                setHighlight(-1);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // Highlighted suggestion wins over raw draft.
                if (highlight >= 0 && filtered[highlight]) commit(filtered[highlight]);
                else commit(draft);
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeInput();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (filtered.length > 0) {
                  setHighlight((h) => Math.min(filtered.length - 1, h < 0 ? 0 : h + 1));
                }
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(-1, h - 1));
              }
            }}
            // Click-outside = close without committing the draft. Enter is the
            // explicit "save what I typed" action; mouseDown on a suggestion
            // (handled below) commits that suggestion. Keeps blur predictable.
            onBlur={(e) => {
              // If focus is moving to a suggestion button, let its mouseDown
              // handler do the commit and don't close yet.
              const next = e.relatedTarget as HTMLElement | null;
              if (next && next.closest(".nd-tags-edit")) return;
              closeInput();
            }}
          />
          {filtered.length > 0 && (
            <div className="nd-tags-sugs">
              {filtered.map((tagVal, i) => (
                <button
                  key={tagVal}
                  type="button"
                  className={"nd-tags-sug" + (i === highlight ? " nd-tags-sug--active" : "")}
                  onMouseEnter={() => setHighlight(i)}
                  // mouseDown fires before the input's blur, with preventDefault
                  // keeping focus on the input — so we can commit cleanly and
                  // the blur handler then closes the input.
                  onMouseDown={(e) => { e.preventDefault(); commit(tagVal); }}
                >
                  <TagChip value={tagVal} compact />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="nd-tags-add"
          onClick={() => setEditing(true)}
          aria-label={t("nd.addTag", { defaultValue: "add tag" })}
        >
          {t("nd.addTagLabel", { defaultValue: "+ tag" })}
        </button>
      )}
    </div>
  );
}
