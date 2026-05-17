
import bibliographyJson from 'virtual:astro-math-book/bibliography';
import bibliographyHref from 'virtual:astro-math-book/bibliography-href';

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
      (<a href={`${bibliographyHref}#bib-${id}`} className="ref-link">{label}</a>)
      <span className="ref-tooltip">
        <button className="ref-pin-btn" aria-label="Pin tooltip"><svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/></svg></button>
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
