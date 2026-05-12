interface Props {
  url: string;
  caption?: string;
  height?: number;
}

function githubToUrls(url: string): { nbviewerUrl: string; colabUrl: string } | null {
  const match = url.match(/^https?:\/\/github\.com\/(.+\.ipynb)$/i);
  if (!match) return null;
  const path = match[1];
  return {
    nbviewerUrl: `https://nbviewer.org/github/${path}`,
    colabUrl: `https://colab.research.google.com/github/${path}`,
  };
}

export function ColabEmbed({ url, caption, height = 600 }: Props) {
  const urls = githubToUrls(url);
  if (!urls) {
    return <span className="ref--unknown">ColabEmbed: expected a GitHub .ipynb URL, got "{url}"</span>;
  }
  const { nbviewerUrl, colabUrl } = urls;

  return (
    <figure className="math-figure colab-embed">
      <div className="colab-embed-screen" style={{ height }}>
        <iframe
          src={nbviewerUrl}
          title={caption ?? 'Jupyter notebook'}
          style={{ width: '100%', height: '100%', border: 0 }}
        />
        <a
          href={colabUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="colab-badge"
          aria-label="Open in Colab"
        >
          <img
            src="https://colab.research.google.com/assets/colab-badge.svg"
            alt="Open in Colab"
          />
        </a>
      </div>
      <div className="colab-embed-print">
        <p className="colab-embed-url">
          Notebook: <a href={colabUrl}>{colabUrl}</a>
        </p>
      </div>
      {caption && (
        <figcaption className="math-figure-caption">{caption}</figcaption>
      )}
    </figure>
  );
}
