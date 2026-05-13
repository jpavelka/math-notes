/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react';
import type { RegistryEntry } from '../../lib/registry';
import registryJson from 'virtual:astro-math-book/registry';
import { renderInlineMath } from './renderInlineMath';

// ── Registry search ───────────────────────────────────────────────────────────

const ALL_ENTRIES = Object.values(registryJson) as RegistryEntry[];
const ALL_ENV_ENTRIES = ALL_ENTRIES.filter(e => e.type !== 'Symbol');
const ALL_SYM_ENTRIES = ALL_ENTRIES.filter(e => e.type === 'Symbol');

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const plainText = new Map(
  ALL_ENTRIES.map(e => [e.id, stripHtml(e.contentHTML).toLowerCase()])
);

function scoreEntry(entry: RegistryEntry, q: string, qNoSlash: string): number {
  const type  = entry.type.toLowerCase();
  const num   = (entry.number ?? '').toLowerCase();
  const title = (entry.title  ?? '').toLowerCase();
  const label = (entry.label  ?? '').toLowerCase();
  const tn    = `${type} ${num}`;
  const body  = plainText.get(entry.id) ?? '';
  const latex = (entry.latex ?? '').toLowerCase()
    .replace(/\\([a-z]+)/g, '$1').replace(/[^a-z0-9]/g, '');
  const aliases = [
    ...(entry.aliases?.map(a => a.toLowerCase()) ?? []),
    ...(entry.alt?.map(a => a.toLowerCase()) ?? []),
  ];

  if (label && label === q)              return 100;
  if (tn === q)                          return 90;
  if (title === q)                       return 85;
  if (latex && latex === qNoSlash)       return 80;
  if (aliases.some(a => a === q))        return 73;
  if (label && label.startsWith(q))     return 75;
  if (title.startsWith(q))               return 70;
  if (tn.startsWith(q))                  return 65;
  if (type.startsWith(q))                return 55;
  if (label && label.includes(q))       return 50;
  if (title.includes(q))                 return 45;
  if (aliases.some(a => a.includes(q))) return 43;
  if (tn.includes(q))                    return 40;
  if (num.includes(q))                   return 35;
  if (type.includes(q))                  return 30;
  if (latex && latex.includes(qNoSlash)) return 20;
  if (body.includes(q))                  return 15;
  return 0;
}

function searchRegistry(query: string): { envResults: RegistryEntry[]; symResults: RegistryEntry[] } {
  const q = query.toLowerCase().trim();
  if (!q) return { envResults: [], symResults: [] };
  const qNoSlash = q.replace(/\\/g, '');

  const envResults = ALL_ENV_ENTRIES
    .map(e => ({ e, s: scoreEntry(e, q, qNoSlash) }))
    .filter(x => x.s > 0)
    .sort((a, b) =>
      b.s - a.s ||
      a.e.type.localeCompare(b.e.type) ||
      (a.e.number ?? '').localeCompare(b.e.number ?? '', undefined, { numeric: true })
    )
    .slice(0, 6)
    .map(x => x.e);

  const symResults = ALL_SYM_ENTRIES
    .map(e => ({ e, s: scoreEntry(e, q, qNoSlash) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map(x => x.e);

  return { envResults, symResults };
}

const ENV_TYPES = new Set(['theorem', 'definition', 'lemma', 'corollary', 'remark']);

function typeColor(type: string) {
  return ENV_TYPES.has(type.toLowerCase())
    ? `var(--env-${type.toLowerCase()}-border)`
    : 'var(--text-muted)';
}

// ── Pagefind (lazy, cached) ───────────────────────────────────────────────────

interface PFData {
  url: string;
  meta: { title?: string };
  excerpt: string;
}

interface PFInstance {
  init: () => Promise<void>;
  search: (q: string) => Promise<{ results: Array<{ data: () => Promise<PFData> }> }>;
}

let pfInstance: PFInstance | null = null;

async function loadPagefind(): Promise<PFInstance | null> {
  if (pfInstance) return pfInstance;
  try {
    pfInstance = await (new Function('return import("/pagefind/pagefind.js")')()) as PFInstance;
    await pfInstance.init();
    return pfInstance;
  } catch {
    return null;
  }
}

// ── Result types ──────────────────────────────────────────────────────────────

type Item =
  | { kind: 'env'; entry: RegistryEntry }
  | { kind: 'sym'; entry: RegistryEntry }
  | { kind: 'pf';  url: string; title: string; excerpt: string };

const SEC_ENV = 'Environments';
const SEC_SYM = 'Notation';
const SEC_PF  = 'In text';

// ── Component ─────────────────────────────────────────────────────────────────

export function RegistrySearch() {
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState('');
  const [cursor, setCursor]       = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
  const [envResults, setEnvResults] = useState<RegistryEntry[]>([]);
  const [symResults, setSymResults] = useState<RegistryEntry[]>([]);
  const [pfResults, setPfResults]   = useState<PFData[]>([]);
  const [pfLoading, setPfLoading]   = useState(false);
  const inputRef       = useRef<HTMLInputElement>(null);
  const bodyRef        = useRef<HTMLDivElement>(null);
  // Snapshot of the selection captured at mousedown, before the browser clears it
  const selectionRef   = useRef('');

  // Exclude collapsed sections from keyboard navigation
  const visibleEnv = collapsed.has(SEC_ENV) ? [] : envResults;
  const visibleSym = collapsed.has(SEC_SYM) ? [] : symResults;
  const visiblePf  = collapsed.has(SEC_PF)  ? [] : pfResults;

  const items: Item[] = [
    ...visibleEnv.map(e  => ({ kind: 'env' as const, entry: e })),
    ...visibleSym.map(e  => ({ kind: 'sym' as const, entry: e })),
    ...visiblePf.map(pf  => ({ kind: 'pf'  as const, url: pf.url, title: pf.meta?.title ?? pf.url, excerpt: pf.excerpt })),
  ];

  const pfOffset = visibleEnv.length + visibleSym.length;

  function toggleSection(name: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Capture selection at mousedown (capture phase fires before browser clears it on click)
  useEffect(() => {
    function capture() {
      selectionRef.current = window.getSelection()?.toString().trim() ?? '';
    }
    document.addEventListener('mousedown', capture, true);
    return () => document.removeEventListener('mousedown', capture, true);
  }, []);

  // ⌘K / Ctrl+K — selection is still live on keydown, so read it directly
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        selectionRef.current = window.getSelection()?.toString().trim() ?? '';
        setOpen(o => !o);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Sidebar button
  useEffect(() => {
    function onOpen() { setOpen(true); }
    document.addEventListener('open-registry-search', onOpen);
    return () => document.removeEventListener('open-registry-search', onOpen);
  }, []);

  // Reset + focus when opening; pre-warm Pagefind
  useEffect(() => {
    if (!open) return;
    const sel = selectionRef.current;
    selectionRef.current = '';
    setQuery(sel);
    setEnvResults([]);
    setSymResults([]);
    setPfResults([]);
    setCollapsed(new Set());
    setExpanded(new Set());
    setCursor(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (sel) inputRef.current?.select();
    });
    if (import.meta.env.PROD) loadPagefind();
  }, [open]);

  // Synchronous registry search
  useEffect(() => {
    const { envResults, symResults } = searchRegistry(query);
    setEnvResults(envResults);
    setSymResults(symResults);
    setCursor(0);
  }, [query]);

  // Debounced Pagefind search (prod only)
  useEffect(() => {
    if (!import.meta.env.PROD || !query.trim()) {
      setPfResults([]);
      setPfLoading(false);
      return;
    }
    setPfLoading(true);
    const timer = setTimeout(async () => {
      const pf = await loadPagefind();
      if (!pf) { setPfLoading(false); return; }
      const { results } = await pf.search(query);
      const data = await Promise.all(results.slice(0, 5).map(r => r.data()));
      setPfResults(data);
      setPfLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset cursor when visible item count changes
  useEffect(() => { setCursor(0); }, [items.length]);

  // Scroll active item into view
  useEffect(() => {
    (bodyRef.current?.querySelector('[data-active="true"]') as HTMLElement | null)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      const item = items[cursor];
      if (item) go(item.kind === 'pf' ? item.url : item.entry.href);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function go(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  if (!open) return null;

  const showEmpty = query.trim() && items.length === 0 && !pfLoading
    && collapsed.size === 0;

  return (
    <div className="reg-search-backdrop" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
      <div className="reg-search-modal" onClick={e => e.stopPropagation()}>

        <input
          ref={inputRef}
          className="reg-search-input"
          placeholder="Search theorems, definitions, notation…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search"
        />

        <div ref={bodyRef} className="reg-search-body">
          {envResults.length > 0 && (
            <section>
              <div
                className="reg-search-section-header"
                data-collapsed={collapsed.has(SEC_ENV) ? '' : undefined}
                onClick={() => toggleSection(SEC_ENV)}
              >
                {SEC_ENV}
              </div>
              {!collapsed.has(SEC_ENV) && envResults.map((entry, i) => {
                const active = i === cursor;
                return (
                  <div
                    key={entry.id}
                    className={`reg-search-item${active ? ' reg-search-item--active' : ''}`}
                    data-active={active ? 'true' : undefined}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(entry.href)}
                  >
                    <div className="reg-search-item-header">
                      <span className="reg-search-type" style={{ color: typeColor(entry.type) } as React.CSSProperties}>
                        {entry.type}&nbsp;{entry.number}
                      </span>
                      {entry.label && <span className="reg-search-label">({entry.label})</span>}
                      {entry.title && <span className="reg-search-title" dangerouslySetInnerHTML={{ __html: renderInlineMath(entry.title) }} />}
                    </div>
                    {entry.kind !== 'float' && entry.contentHTML && (
                      <>
                        <div
                          className={`reg-search-preview${expanded.has(entry.id) ? ' reg-search-preview--expanded' : ''}`}
                          dangerouslySetInnerHTML={{ __html: entry.contentHTML }}
                        />
                        <button
                          className="reg-search-expand-btn"
                          onClick={e => { e.stopPropagation(); toggleExpanded(entry.id); }}
                        >
                          {expanded.has(entry.id) ? '↑ collapse' : '↓ expand'}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {symResults.length > 0 && (
            <section>
              <div
                className="reg-search-section-header"
                data-collapsed={collapsed.has(SEC_SYM) ? '' : undefined}
                onClick={() => toggleSection(SEC_SYM)}
              >
                {SEC_SYM}
              </div>
              {!collapsed.has(SEC_SYM) && symResults.map((entry, i) => {
                const idx = visibleEnv.length + i;
                const active = idx === cursor;
                return (
                  <div
                    key={entry.id}
                    className={`reg-search-item${active ? ' reg-search-item--active' : ''}`}
                    data-active={active ? 'true' : undefined}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => go(entry.href)}
                  >
                    <div className="reg-search-item-header">
                      <span
                        className="reg-search-sym-latex"
                        dangerouslySetInnerHTML={{ __html: entry.contentHTML }}
                      />
                      {entry.title && <span className="reg-search-title" dangerouslySetInnerHTML={{ __html: renderInlineMath(entry.title) }} />}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {import.meta.env.PROD && (pfLoading || pfResults.length > 0) && (
            <section>
              <div
                className="reg-search-section-header"
                data-collapsed={collapsed.has(SEC_PF) ? '' : undefined}
                onClick={() => toggleSection(SEC_PF)}
              >
                {SEC_PF}{pfLoading && <span className="reg-search-spinner"> …</span>}
              </div>
              {!collapsed.has(SEC_PF) && pfResults.map((pf, i) => {
                const idx = pfOffset + i;
                const active = idx === cursor;
                return (
                  <div
                    key={pf.url}
                    className={`reg-search-item${active ? ' reg-search-item--active' : ''}`}
                    data-active={active ? 'true' : undefined}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => go(pf.url)}
                  >
                    <div className="reg-search-item-header">
                      <span className="reg-search-pf-title">{pf.meta?.title ?? pf.url}</span>
                    </div>
                    <div className="reg-search-excerpt" dangerouslySetInnerHTML={{ __html: pf.excerpt }} />
                  </div>
                );
              })}
            </section>
          )}

          {showEmpty && <p className="reg-search-empty">No results</p>}
        </div>

        <div className="reg-search-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> go</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
