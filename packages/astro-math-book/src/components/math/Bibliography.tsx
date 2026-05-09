
import bibliographyJson from 'virtual:astro-math-book/bibliography';

const bibliography = bibliographyJson;

export function Bibliography({ citeIds }: { citeIds?: string[] }) {
  const all = Object.values(bibliography);
  const entries = (citeIds != null ? all.filter(e => citeIds.includes(e.key)) : all)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (entries.length === 0) return null;

  return (
    <div className="bibliography">
      {entries.map(entry => (
        <div key={entry.key} id={`bib-${entry.key}`} className={`bib-entry${entry.image ? ' bib-entry--with-image' : ''}`}>
          {entry.image && <img src={entry.image} alt="" className="bib-entry-img" />}
          <span dangerouslySetInnerHTML={{ __html: entry.formatted }} />
        </div>
      ))}
    </div>
  );
}
