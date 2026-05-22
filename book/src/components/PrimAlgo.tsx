import { useMemo } from 'react';
import { computeEdgeGeom, toSvg, edgeKey, thStyle, tdBase } from './primAlgoUtils';
import { usePrimPhase } from './usePrimPhase';
import { PrimPhaseCanvas } from './PrimPhaseCanvas';

interface Props {
  width?: number;
  height?: number;
  nodeRadius?: number;
  labelFontSize?: number;
  edgeWeightFontSize?: number;
  /** 0–1 multiplier applied to all edge probabilities. 1 = current defaults, 0 = minimum connectivity only. */
  density?: number;
}

export function PrimAlgo({
  width = 520,
  height = 340,
  nodeRadius = 22,
  labelFontSize = 18,
  edgeWeightFontSize = 14,
  density = 1,
}: Props) {
  const prim = usePrimPhase(density);
  const { graph, snap, stepIndex, handleEdgeClick, goPrev, goNext, reset, newGraph, toast, wrongEdge } = prim;
  const { nodes, edges } = graph;
  const { phase, U, T, history } = snap;

  const pad = nodeRadius + 6;
  const posMap = useMemo(
    () => new Map(nodes.map(n => [n.id, toSvg(n.x, n.y, width, height, pad)])),
    [nodes, width, height, pad],
  );
  const edgeGeom = useMemo(
    () => computeEdgeGeom(edges, posMap, nodeRadius, edgeWeightFontSize),
    [edges, posMap, nodeRadius, edgeWeightFontSize],
  );

  const totalWeight = [...T].reduce((sum, k) => {
    const e = edges.find(e => edgeKey(e.u, e.v) === k);
    return sum + (e?.weight ?? 0);
  }, 0);

  const statusMsg = phase === 'done'
    ? `MST complete! Total weight: ${totalWeight}`
    : `Click the minimum-cost edge with one endpoint in the tree (blue) and one outside.`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <button onClick={newGraph}>New graph</button>

      <PrimPhaseCanvas
        nodes={nodes} posMap={posMap} edgeGeom={edgeGeom}
        U={U} T={T} phase={phase}
        wrongEdge={wrongEdge} toast={toast}
        onEdgeClick={handleEdgeClick}
        width={width} height={height}
        nodeRadius={nodeRadius} labelFontSize={labelFontSize}
        edgeWeightFontSize={edgeWeightFontSize}
      />

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={goPrev} disabled={stepIndex === 0}>← Prev</button>
        <button
          onClick={phase === 'done' ? reset : () => {}}
          style={{ visibility: phase === 'done' ? 'visible' : 'hidden' }}
        >
          Reset
        </button>
        <button onClick={goNext} disabled={phase === 'done'}>Next →</button>
      </div>

      <div style={{
        fontSize: '0.9em', textAlign: 'center',
        color: phase === 'done' ? '#16a34a' : 'var(--text-muted)',
        fontWeight: phase === 'done' ? 600 : 400,
      }}>
        {statusMsg}
      </div>

      <div style={{ overflowX: 'auto', maxWidth: `${width}px`, width: '100%' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.82em', margin: '0 auto' }}>
          <thead>
            <tr>
              <th style={thStyle}>edge added</th>
              <th style={{ ...thStyle, borderRight: '3px solid var(--text-muted)' }}>weight</th>
              <th style={thStyle}><em>U</em></th>
            </tr>
          </thead>
          <tbody>
            {history.map((rec, row) => (
              <tr key={row}>
                <td style={tdBase}>
                  {rec.addedEdge
                    ? `(${[rec.addedEdge.u, rec.addedEdge.v].sort().join(', ')})`
                    : '—'}
                </td>
                <td style={{ ...tdBase, borderRight: '3px solid var(--text-muted)' }}>
                  {rec.addedEdge?.weight ?? '—'}
                </td>
                <td style={tdBase}>{`{${rec.U.join(', ')}}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
