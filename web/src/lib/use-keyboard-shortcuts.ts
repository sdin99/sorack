// Central keyboard shortcut registry. Each App-level binding is a row in the
// array passed to useKeyboardShortcuts; the hook attaches a single window
// keydown listener that dispatches to the first matching row.
//
// Component-local handlers (e.g. NodeDetail's Esc-to-close, search overlay's
// own Cmd+K) stay inside their owning components — they need props/setters
// that aren't worth lifting just to centralize. The hook covers App-level
// globals only.
//
// A ref keeps the shortcuts array fresh across renders without re-attaching
// the listener: the closure always reads the current array (so handlers see
// latest state) while the effect itself runs once.

import { useEffect, useRef } from "react";

// Shared "typing into a field" test — App-level shortcuts skip when this is
// true so the user's keypress reaches the input instead of firing a global
// action (Delete erases a character, not the node). Local handlers that
// allow firing while typing (e.g. Esc to cancel an edit) check this on
// their own.
export const isTypingEl = (el: EventTarget | null): boolean =>
  !!el
  && el instanceof HTMLElement
  && (el.tagName === "INPUT"
    || el.tagName === "TEXTAREA"
    || el.tagName === "SELECT"
    || el.isContentEditable);

export interface Shortcut {
  // Matched against `e.key` (case-insensitive). Examples: 'k', 'Delete',
  // 'Escape', '[', ']', 'z', 'y'.
  key: string;
  // Modifier constraints. Undefined = don't care; true/false = must match.
  // `cmd` matches metaKey OR ctrlKey (Mac + Windows / Linux).
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  // What to run. Return false to opt out of preventDefault (the default is
  // to preventDefault on a match).
  handler: (e: KeyboardEvent) => void | boolean;
  // Set true to fire while focused in an input/textarea/contentEditable.
  // Default false — App-level globals stay out of the way while typing.
  whenTyping?: boolean;
  // Conditional gate evaluated at keypress time. Use for things like "only
  // when a node is selected" — checked at fire time so the closure reads
  // current state, not whatever was true when the shortcut was registered.
  when?: () => boolean;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingEl(e.target);
      const cmd = e.metaKey || e.ctrlKey;
      for (const s of ref.current) {
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue;
        if (s.cmd !== undefined && s.cmd !== cmd) continue;
        if (s.shift !== undefined && s.shift !== e.shiftKey) continue;
        if (s.alt !== undefined && s.alt !== e.altKey) continue;
        if (typing && !s.whenTyping) continue;
        if (s.when && !s.when()) continue;
        const ret = s.handler(e);
        if (ret !== false) e.preventDefault();
        return; // first match wins
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
