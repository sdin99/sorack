// @ts-nocheck — Phase 1 마이그.

// runbook.jsx — runbook viewer (markdown rendering + node mentions).

import * as React from "react";
import { useState as useStateRB, useMemo as useMemoRB } from "react";
import { useSorack } from "@/lib/data-source/SorackData";

// Tiny markdown renderer — enough for the SOPs we ship.
// Custom: [[node-id]] becomes a button that jumps to that node.
function renderMarkdown(md, onNodeJump, onRunbookJump, NODES, RUNBOOKS) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let key = 0;

  const renderInline = (text) => {
    // Order matters: code → mentions → links → bold → italic
    const parts = [];
    let s = text;
    // Mentions [[id]]
    s = s.replace(/\[\[([\w-]+)\]\]/g, (_, id) => `\u0000M:${id}\u0000`);
    // inline code
    s = s.replace(/`([^`]+)`/g, '\u0000C:$1\u0000');
    // bold
    s = s.replace(/\*\*([^*]+)\*\*/g, '\u0000B:$1\u0000');
    // italic
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '\u0000I:$1\u0000');

    const tokens = s.split('\u0000');
    return tokens.map((tok, j) => {
      if (tok.startsWith('M:')) {
        const id = tok.slice(2);
        const isRb = id.startsWith('rb-');
        const target = isRb ? RUNBOOKS[id] : NODES[id];
        if (!target) return <span key={j} className="md-mention md-mention--broken">[[{id}]]</span>;
        return (
          <button
            key={j}
            className={`md-mention md-mention--${isRb ? 'rb' : 'node'}`}
            onClick={() => isRb ? onRunbookJump(id) : onNodeJump(id)}
          >
            <span className="md-mention-kind">{isRb ? 'runbook' : target.kind}</span>
            <span className="md-mention-name">{isRb ? target.title : target.name}</span>
          </button>
        );
      }
      if (tok.startsWith('C:')) return <code key={j} className="md-code">{tok.slice(2)}</code>;
      if (tok.startsWith('B:')) return <strong key={j}>{tok.slice(2)}</strong>;
      if (tok.startsWith('I:')) return <em key={j}>{tok.slice(2)}</em>;
      return <React.Fragment key={j}>{tok}</React.Fragment>;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code block ``` ... ```
    if (line.trim().startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]); i++;
      }
      i++; // skip closing
      out.push(<pre key={key++} className="md-pre"><code>{buf.join('\n')}</code></pre>);
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const lvl = h[1].length;
      const Tag = `h${lvl}`;
      out.push(<Tag key={key++} className={`md-h md-h${lvl}`}>{renderInline(h[2])}</Tag>);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, '')); i++;
      }
      out.push(<blockquote key={key++} className="md-quote">{buf.map((b, k) => <div key={k}>{renderInline(b)}</div>)}</blockquote>);
      continue;
    }

    // Checkbox + bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*[-*]\s+(\[[ x]\]\s+)?(.*)$/);
        const isCheck = !!m[1];
        const checked = isCheck && m[1].includes('x');
        items.push({ isCheck, checked, text: m[2] });
        i++;
      }
      out.push(
        <ul key={key++} className="md-ul">
          {items.map((it, k) => (
            <li key={k} className={it.isCheck ? 'md-li-check' : 'md-li'}>
              {it.isCheck && <span className={`md-check ${it.checked ? 'md-check--on' : ''}`}>{it.checked ? '✓' : ''}</span>}
              {renderInline(it.text)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(<ol key={key++} className="md-ol">{items.map((t, k) => <li key={k}>{renderInline(t)}</li>)}</ol>);
      continue;
    }

    // Blank → spacer
    if (!line.trim()) { i++; continue; }

    // Paragraph (accumulate consecutive non-blank, non-special lines)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*[-*]\s|\s*\d+\.\s|```)/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(<p key={key++} className="md-p">{renderInline(buf.join(' '))}</p>);
  }

  return out;
}

function RunbookTreeItem({ rb, active, onClick }) {
  const stateColor = {
    'planned': 'var(--fg-3)',
    'in-progress': 'var(--warn)',
    'completed': 'var(--ok)',
    'rollback': 'var(--err)',
  }[rb.state] || 'var(--fg-3)';
  return (
    <button className={`rb-tree-item ${active ? 'rb-tree-item--active' : ''}`} onClick={onClick}>
      <span className="rb-tree-dot" style={{ background: stateColor }} />
      <span className="rb-tree-title">{rb.title}</span>
      <span className="rb-tree-date">{rb.updated.slice(5)}</span>
    </button>
  );
}

export function RunbookViewer({ runbookId, onClose, onJumpNode, onJumpRunbook }) {
  const { NODES, RUNBOOKS } = useSorack();
  const [filterCat, setFilterCat] = useStateRB('all');
  const [filterState, setFilterState] = useStateRB('all');
  const [query, setQuery] = useStateRB('');

  const rb = runbookId ? RUNBOOKS[runbookId] : null;

  const filtered = useMemoRB(() => {
    return Object.values(RUNBOOKS).filter(r => {
      if (filterCat !== 'all' && r.category !== filterCat) return false;
      if (filterState !== 'all' && r.state !== filterState) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!`${r.title} ${r.md} ${(r.tags || []).join(' ')}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.updated < b.updated ? 1 : -1));
  }, [filterCat, filterState, query]);

  // group by category for the tree
  const grouped = useMemoRB(() => {
    const g = {};
    for (const r of filtered) { (g[r.category] = g[r.category] || []).push(r); }
    return g;
  }, [filtered]);

  return (
    <div className="rb-viewer">
      <header className="rb-head">
        <div className="rb-head-l">
          <button className="rb-back" onClick={onClose}>← topology</button>
          <div className="rb-head-title">runbooks</div>
        </div>
        <div className="rb-head-r">
          <input
            className="rb-search"
            placeholder="search title, body, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <div className="rb-body">
        <aside className="rb-tree">
          <div className="rb-filters">
            <div className="rb-filter-row">
              <span className="rb-filter-k">category</span>
              {['all', 'SOP', '작업계획서'].map(c => (
                <button
                  key={c}
                  className={`rb-filter-btn ${filterCat === c ? 'rb-filter-btn--on' : ''}`}
                  onClick={() => setFilterCat(c)}
                >{c}</button>
              ))}
            </div>
            <div className="rb-filter-row">
              <span className="rb-filter-k">state</span>
              {['all', 'planned', 'in-progress', 'completed', 'rollback'].map(s => (
                <button
                  key={s}
                  className={`rb-filter-btn ${filterState === s ? 'rb-filter-btn--on' : ''}`}
                  onClick={() => setFilterState(s)}
                >{s}</button>
              ))}
            </div>
          </div>

          <div className="rb-tree-list">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="rb-tree-group">
                <div className="rb-tree-group-h">{cat} <span className="rb-tree-group-c">{items.length}</span></div>
                {items.map(r => (
                  <RunbookTreeItem
                    key={r.id}
                    rb={r}
                    active={r.id === runbookId}
                    onClick={() => onJumpRunbook(r.id)}
                  />
                ))}
              </div>
            ))}
            {filtered.length === 0 && <div className="rb-tree-empty">no matches</div>}
          </div>
        </aside>

        <main className="rb-main">
          {rb ? (
            <article className="rb-article">
              <div className="rb-meta-row">
                <span className="rb-meta-cat">{rb.category}</span>
                <span className={`rb-meta-state rb-meta-state--${rb.state}`}>{rb.state}</span>
                <span className="rb-meta-date">updated {rb.updated}</span>
                <a className="rb-meta-repo" href="#" onClick={(e) => e.preventDefault()}>
                  {rb.repo} ↗
                </a>
              </div>
              <h1 className="rb-h1">{rb.title}</h1>
              {rb.tags && rb.tags.length > 0 && (
                <div className="rb-tags">
                  {rb.tags.map(t => <span key={t} className="rb-tag">#{t}</span>)}
                </div>
              )}
              <div className="rb-content">
                {renderMarkdown(rb.md, onJumpNode, onJumpRunbook, NODES, RUNBOOKS)}
              </div>
            </article>
          ) : (
            <div className="rb-empty">
              <div className="rb-empty-h">runbook 을 선택하세요</div>
              <div className="rb-empty-s">왼쪽 트리에서 고르거나, 노드 상세 패널의 "관련 runbook" 으로 점프</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

