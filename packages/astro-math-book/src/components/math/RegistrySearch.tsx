/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react';
import type { RegistryEntry } from '../../lib/registry';
import registryJson from 'virtual:astro-math-book/registry';

// ── Registry search ───────────────────────────────────────────────────────────

const ALL_ENTRIES = Object.values(registryJson) as RegistryEntry[];

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const plainText = new Map(
  ALL_ENTRIES.map(e => [e.id, stripHtml(e.contentHTML).toLowerCase()])
);

function scoreEntry(entry: RegistryEntry, q: string): number {
  const type  = entry.type.toLowerCase();
  const num   = (entry.number ?? '').toLowerCase();
  const title = (entry.title  ?? '').toLowerCase();
  const label = (entry.label  ?? '').toLowerCase();
  const tn    = `${type} ${num}`;
  const body  = plainText.get(entry.id) ?? '';

  if (label && label === q)          return 100;
  if (tn === q)                       return 90;
  if (title === q)                    return 85;
  if (label && label.startsWith(q))  return 75;
  if (title.startsWith(q))            return 70;
  if (tn.startsWith(q))               return 65;
  if (type.startsWith(q))             return 55;
  if (label && label.includes(q))    return 50;
  if (title.includes(q))              return 45;
  if (tn.includes(q))                 return 40;
  if (num.includes(q))                return 35;
  if (type.includes(q))               return 30;
  if (body.includes(q))               return 15;
  return 0;
}

function searchRegistry(query: string): RegistryEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return ALL_ENTRIES
    .map(e => ({ e, s: scoreEntry(e, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) =>
      b.s - a.s ||
      a.e.type.localeCompare(b.e.type) ||
      (a.e.number ?? '').localeCompare(b.e.number ?? '', undefined, { numeric: true })
    )
    .slice(0, 8)
    .map(x => x.e);
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
  | { kind: 'pf';  url: string; title: string; excerpt: string };

// ── Component ─────────────────────────────────────────────────────────────────

export function RegistrySearch() {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [cursor, setCursor]   = useState(0);
  const [envResults, setEnvResults] = useState<RegistryEntry[]>([]);
  const [pfResults, setPfResults]   = useState<PFData[]>([]);
  const [pfLoading, setPfLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef  = useRef<HTMLDivElement>(null);

  const items: Item[] = [
    ...envResults.map(e  => ({ kind: 'env' as const, entry: e })),
    ...pfResults.map(pf  => ({ kind: 'pf'  as const, url: pf.url, title: pf.meta?.title ?? pf.url, excerpt: pf.excerpt })),
  ];

  // ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
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
    setQuery('');
    setEnvResults([]);
    setPfResults([]);
    setCursor(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    if (import.meta.env.PROD) loadPagefind();
  }, [open]);

  // Synchronous registry search
  useEffect(() => {
    setEnvResults(searchRegistry(query));
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

  // Reset cursor when total result count changes
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
      if (item) go(item.kind === 'env' ? item.entry.href : item.url);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function go(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  if (!open) return null;

  const showEmpty = query.trim() && items.length === 0 && !pfLoading;

  return (
    <div className="reg-search-backdrop" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
      <div className="reg-search-modal" onClick={e => e.stopPropagation()}>

        <input
          ref={inputRef}
          className="reg-search-input"
          placeholder="Search theorems, definitions, or text…"
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
              <div className="reg-search-section-header">Environments</div>
              {envResults.map((entry, i) => {
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
                      {entry.title && <span className="reg-search-title">{entry.title}</span>}
                    </div>
                    {entry.kind !== 'float' && entry.contentHTML && (
                      <div className="reg-search-preview" dangerouslySetInnerHTML={{ __html: entry.contentHTML }} />
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {import.meta.env.PROD && (pfLoading || pfResults.length > 0) && (
            <section>
              <div className="reg-search-section-header">
                In text{pfLoading && <span className="reg-search-spinner"> …</span>}
              </div>
              {pfResults.map((pf, i) => {
                const idx = envResults.length + i;
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
