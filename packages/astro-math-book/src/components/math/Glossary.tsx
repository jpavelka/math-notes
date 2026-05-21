import { useState } from 'react';
import registryJson from 'virtual:astro-math-book/registry';
import type { RegistryEntry } from '../../lib/registry';
import { renderInlineMath } from './renderInlineMath';

interface Props {
  /** 'alpha' (default) sorts A–Z by term; 'chapter' sorts by definition number */
  sortBy?: 'alpha' | 'chapter';
}

type PrimaryItem = { kind: 'primary'; entry: RegistryEntry & { title: string } };
type SeeItem     = { kind: 'see'; term: string; primary: RegistryEntry & { title: string } };
type GlossaryItem = PrimaryItem | SeeItem;

function sortKey(s: string): string {
  return s.replace(/\$([^$]*)\$/g, '$1').replace(/\\/g, '').toLowerCase();
}

function matchesFilter(item: GlossaryItem, q: string): boolean {
  const searchIn = (s: string) => sortKey(s).includes(q);
  if (item.kind === 'primary') {
    return searchIn(item.entry.title) || (item.entry.alt ?? []).some(searchIn);
  }
  return searchIn(item.term) || searchIn(item.primary.title);
}

export function Glossary({ sortBy = 'alpha' }: Props) {
  const [filter, setFilter] = useState('');

  const primaries = (Object.values(registryJson) as RegistryEntry[])
    .filter((e): e is RegistryEntry & { title: string } =>
      e.type === 'Definition' && typeof e.title === 'string' && e.title.length > 0
    );

  if (primaries.length === 0) {
    return <p className="glossary-empty">No titled definitions found.</p>;
  }

  let items: GlossaryItem[];

  if (sortBy === 'chapter') {
    primaries.sort((a, b) =>
      (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true })
    );
    items = primaries.map(e => ({ kind: 'primary', entry: e }));
  } else {
    const all: GlossaryItem[] = primaries.map(e => ({ kind: 'primary', entry: e }));
    for (const entry of primaries) {
      for (const term of entry.alt ?? []) {
        all.push({ kind: 'see', term, primary: entry });
      }
    }
    all.sort((a, b) => {
      const ka = a.kind === 'primary' ? sortKey(a.entry.title) : sortKey(a.term);
      const kb = b.kind === 'primary' ? sortKey(b.entry.title) : sortKey(b.term);
      return ka.localeCompare(kb);
    });
    items = all;
  }

  const q = filter.toLowerCase();
  const visibleItems = q ? items.filter(item => matchesFilter(item, q)) : items;

  return (
    <div className="glossary-wrap">
      <input
        className="glossary-filter"
        type="search"
        placeholder="Filter terms…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        aria-label="Filter glossary terms"
      />
      {visibleItems.length === 0 ? (
        <p className="glossary-empty">No matching terms.</p>
      ) : (
        <dl className="glossary">
          {visibleItems.map(item => {
            if (item.kind === 'primary') {
              const { entry } = item;
              return (
                <div key={entry.id} id={`glossary-${entry.id}`} className="glossary-entry">
                  <dt className="glossary-term">
                    <span dangerouslySetInnerHTML={{ __html: renderInlineMath(entry.title) }} />
                    <a href={entry.href} className="glossary-ref">
                      Definition {entry.label ?? entry.number} →
                    </a>
                  </dt>
                  <dd
                    className="glossary-body"
                    dangerouslySetInnerHTML={{ __html: entry.contentHTML }}
                  />
                </div>
              );
            } else {
              const { term, primary } = item;
              return (
                <div key={`see-${primary.id}-${term}`} className="glossary-entry glossary-entry--see">
                  <dt className="glossary-term">
                    <span dangerouslySetInnerHTML={{ __html: renderInlineMath(term) }} />
                  </dt>
                  <dd className="glossary-body glossary-body--see">
                    See <a href={`#glossary-${primary.id}`} className="ref-link" dangerouslySetInnerHTML={{
                      __html: renderInlineMath(primary.title)
                    }} />
                  </dd>
                </div>
              );
            }
          })}
        </dl>
      )}
    </div>
  );
}
