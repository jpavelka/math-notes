interface Props {
  videoId: string;
  id?: string;
  start?: number;
  end?: number;
  caption?: string;
  number?: string;
  title?: string;
  aspectRatio?: '16/9' | '4/3';
  controls?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function YouTubeEmbed({
  videoId,
  id,
  start,
  end,
  caption,
  number,
  title = 'YouTube video',
  aspectRatio = '16/9',
  controls = true,
  autoplay = false,
  muted = false,
  loop = false,
}: Props) {
  const params = new URLSearchParams();
  if (start !== undefined) params.set('start', String(start));
  if (end !== undefined) params.set('end', String(end));
  if (autoplay) params.set('autoplay', '1');
  if (muted) params.set('mute', '1');
  if (loop) { params.set('loop', '1'); params.set('playlist', videoId); }
  if (!controls) params.set('controls', '0');

  const src = `https://www.youtube.com/embed/${videoId}?${params}`;
  const watchUrl = `https://youtu.be/${videoId}${start !== undefined ? `?t=${start}` : ''}`;
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const paddingTop = aspectRatio === '4/3' ? '75%' : '56.25%';

  return (
    <figure className="math-figure yt-embed" id={id}>
      <div className="yt-embed-screen" style={{ position: 'relative', paddingTop }}>
        <iframe
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
      <div className="yt-embed-print">
        <img src={thumbUrl} alt={title} className="yt-embed-thumb" />
        <p className="yt-embed-url">
          <strong>Video{number ? ` ${number}` : ''}:</strong>{' '}
          <a href={watchUrl}>{watchUrl}</a>
          {(start !== undefined || end !== undefined) && (
            <span>
              {' '}({start !== undefined ? formatTimestamp(start) : '0:00'}
              {end !== undefined ? `–${formatTimestamp(end)}` : ''})
            </span>
          )}
        </p>
      </div>
      {(number || caption) && (
        <figcaption className="math-figure-caption">
          {number && <strong>Video {number}</strong>}
          {caption && (number ? <>. {caption}</> : caption)}
        </figcaption>
      )}
    </figure>
  );
}
