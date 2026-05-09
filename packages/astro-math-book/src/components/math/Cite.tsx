
import bibliographyJson from 'virtual:astro-math-book/bibliography';

const bibliography = bibliographyJson;

interface Props {
  id: string;
  page?: string;
}

export function Cite({ id, page }: Props) {
  const entry = bibliography[id];
  if (!entry) {
    return <span className="cite cite--unknown" title={`Unknown citation: ${id}`}>[?:{id}]</span>;
  }

  const label = page ? `${entry.label}, p. ${page}` : entry.label;
  return (
    <span className="ref cite">
      (<a href={`#bib-${id}`} className="ref-link">{label}</a>)
      <span className="ref-tooltip">
        {entry.image ? (
          <span className="cite-with-image">
            <img src={entry.image} alt="" className="cite-tooltip-img" />
            <span dangerouslySetInnerHTML={{ __html: entry.formatted }} />
          </span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: entry.formatted }} />
        )}
      </span>
    </span>
  );
}
