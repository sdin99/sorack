// Renders a mermaid diagram from a fenced ```mermaid code block. The mermaid
// runtime is ~500KB so we dynamic-import it on first use — the heavy chunk
// only lands when a runbook actually contains a diagram. Diagrams that fail
// to parse fall back to showing the source plus an error message.

import { useEffect, useRef, useState } from "react";

// Module-level promise so multiple MermaidBlocks share one import + one
// initialize() call.
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        // Pick a theme that adapts to the app's data-theme attribute. The
        // user can change theme without re-init since each render() reads
        // the current theme; we set 'base' so theme vars fall through.
        theme: document.documentElement.getAttribute("data-theme") === "light" ? "default" : "dark",
        securityLevel: "strict",
        fontFamily: "var(--sans)",
      });
      return m;
    });
  }
  return mermaidPromise;
}

// Each MermaidBlock instance needs a unique element id for mermaid's render.
let counter = 0;
function nextId() { counter += 1; return `mermaid-${counter}`; }

export function MermaidBlock({ content }: { content: string }) {
  const [svg, setSvg] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    getMermaid()
      .then(async (m) => {
        try {
          const { svg } = await m.render(nextId(), content);
          if (!cancelled) setSvg(svg);
        } catch (e: unknown) {
          if (!cancelled) setErr((e as Error)?.message ?? "render failed");
        }
      })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [content]);

  if (err) {
    return (
      <div className="md-mermaid md-mermaid--err">
        <div className="md-mermaid-err-h">mermaid render failed</div>
        <pre className="md-mermaid-err-msg">{err}</pre>
        <pre className="md-mermaid-src">{content}</pre>
      </div>
    );
  }

  return (
    <div className="md-mermaid">
      {svg
        ? <div ref={ref} className="md-mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        : <div className="md-mermaid-loading">rendering diagram…</div>}
    </div>
  );
}
