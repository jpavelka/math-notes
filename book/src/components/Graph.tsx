import { useId } from 'react';

type Node = { id: string; x: number; y: number };
type Edge = { from: string; to: string; weight?: number };
type EdgeStyle = { stroke?: string; strokeWidth?: number };

type GraphProps = {
  width: number;
  height: number;
  nodes: Node[];
  edges: Edge[];
  directed?: boolean;
  nodeRadius?: number;
  labelFontSize?: number;
  edgeWeightFontSize?: number;
  edgeStyles?: Record<string, EdgeStyle>;
};

const CURVE_OFFSET = 25;

export function Graph({
  width,
  height,
  nodes,
  edges,
  directed = false,
  nodeRadius = 20,
  labelFontSize = 16,
  edgeWeightFontSize = 14,
  edgeStyles = {},
}: GraphProps) {
  const uid = useId().replace(/:/g, '');
  const markerId = `graph-arrow-${uid}`;

  // If any coordinate exceeds 1, treat all as pixel values; otherwise treat as
  // fractions of the usable area with (0,0) = bottom-left, (1,1) = top-right.
  const pixelMode = nodes.some(n => n.x > 1 || n.y > 1);
  const pad = nodeRadius + 4;

  const toSvg = (x: number, y: number) => {
    if (pixelMode) return { x, y };
    return {
      x: pad + x * (width - 2 * pad),
      y: (height - pad) - y * (height - 2 * pad),
    };
  };

  const pos = new Map(nodes.map(n => [n.id, toSvg(n.x, n.y)]));
  const edgeSet = new Set(edges.map(e => `${e.from}->${e.to}`));

  return (
    <svg
      width={width}
      height={height}
      style={{ display: 'block', maxWidth: '100%', color: 'var(--text)' }}
    >
      {directed && (
        <defs>
          <marker
            id={markerId}
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
          </marker>
        </defs>
      )}

      {edges.map((edge, i) => {
        const s = pos.get(edge.from)!;
        const t = pos.get(edge.to)!;
        const style = edgeStyles[`${edge.from},${edge.to}`] ?? {};
        const stroke = style.stroke ?? 'currentColor';
        const strokeWidth = style.strokeWidth ?? 1.5;

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        // Perpendicular (left of direction)
        const px = -uy, py = ux;

        const bidirectional = directed && edgeSet.has(`${edge.to}->${edge.from}`);

        if (bidirectional) {
          const cpx = (s.x + t.x) / 2 + px * CURVE_OFFSET;
          const cpy = (s.y + t.y) / 2 + py * CURVE_OFFSET;
          const x1 = s.x + ux * nodeRadius;
          const y1 = s.y + uy * nodeRadius;
          const x2 = t.x - ux * nodeRadius;
          const y2 = t.y - uy * nodeRadius;
          // Midpoint of quadratic bezier at t=0.5
          const lx = 0.25 * x1 + 0.5 * cpx + 0.25 * x2 + px * 10;
          const ly = 0.25 * y1 + 0.5 * cpy + 0.25 * y2 + py * 10;

          return (
            <g key={i}>
              <path
                d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                markerEnd={`url(#${markerId})`}
              />
              {edge.weight !== undefined && (
                <text
                  x={lx} y={ly}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={edgeWeightFontSize} fill={stroke}
                >
                  {edge.weight}
                </text>
              )}
            </g>
          );
        }

        const x1 = directed ? s.x + ux * nodeRadius : s.x;
        const y1 = directed ? s.y + uy * nodeRadius : s.y;
        const x2 = directed ? t.x - ux * nodeRadius : t.x;
        const y2 = directed ? t.y - uy * nodeRadius : t.y;
        const lx = (s.x + t.x) / 2 + px * 12;
        const ly = (s.y + t.y) / 2 + py * 12;

        return (
          <g key={i}>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={stroke}
              strokeWidth={strokeWidth}
              markerEnd={directed ? `url(#${markerId})` : undefined}
            />
            {edge.weight !== undefined && (
              <text
                x={lx} y={ly}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={edgeWeightFontSize} fill={stroke}
              >
                {edge.weight}
              </text>
            )}
          </g>
        );
      })}

      {nodes.map(node => {
        const p = pos.get(node.id)!;
        return (
          <g key={node.id}>
            <circle
              cx={p.x} cy={p.y} r={nodeRadius}
              fill="var(--bg)"
              stroke="currentColor"
              strokeWidth={1.5}
            />
            <text
              x={p.x} y={p.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={labelFontSize}
              fill="currentColor"
            >
              {node.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
