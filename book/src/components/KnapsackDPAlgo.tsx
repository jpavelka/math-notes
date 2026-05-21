import { useState, useRef, useEffect } from 'react';

type Item = { weight: number; value: number };
type Phase = 'filling' | 'done';

type Snapshot = {
  phase: Phase;
  curR: number;  // 1..n while filling; n+1 when done
  curS: number;  // 1..b while filling
  f: (number | null)[][];    // [0..n][0..b]
  S: (number[] | null)[][];  // [0..n][0..b]
};

// ── Random generation ─────────────────────────────────────────────────────────

function randInt(lo: number, hi: number) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function makeInstance(n: number): { items: Item[]; b: number } {
  const b = randInt(5, 7);
  let items: Item[];
  do {
    items = Array.from({ length: n }, () => ({
      weight: randInt(1, 4),
      value: randInt(2, 9),
    }));
  } while (
    items.every(it => it.weight > b) ||
    items.some(it => it.weight > b) ||
    items.reduce((sum, it) => sum + it.weight, 0) <= b
  );
  return { items, b };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

function makeInitSnapshot(items: Item[], b: number): Snapshot {
  const n = items.length;
  return {
    phase: 'filling',
    curR: 1,
    curS: 1,
    f: Array.from({ length: n + 1 }, (_, r) =>
      Array.from({ length: b + 1 }, (_, s) => (r === 0 || s === 0 ? 0 : null))
    ),
    S: Array.from({ length: n + 1 }, (_, r) =>
      Array.from({ length: b + 1 }, (_, s) => (r === 0 || s === 0 ? ([] as number[]) : null))
    ),
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  padding: '4px 10px',
  textAlign: 'center',
  fontWeight: 600,
  background: 'color-mix(in srgb, currentColor 6%, var(--bg))',
  fontSize: '0.82em',
};

const tdBase: React.CSSProperties = {
  border: '1px solid var(--border)',
  padding: '3px 10px',
  textAlign: 'center',
  fontSize: '0.82em',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  n?: number;
}

export function KnapsackDPAlgo({ n = 3 }: Props) {
  const [instance, setInstance] = useState(() => makeInstance(n));
  const { items, b } = instance;
  const itemCount = items.length;

  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => [makeInitSnapshot(items, b)]);
  const [stepIndex, setStepIndex] = useState(0);

  const snap = snapshots[stepIndex];
  const { phase, curR, curS, f, S } = snap;

  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const includeBtnRef = useRef<HTMLButtonElement>(null);
  const excludeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t => ({ msg, key: (t?.key ?? 0) + 1 }));
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  function shakeBtn(ref: React.RefObject<HTMLButtonElement | null>) {
    const btn = ref.current;
    if (!btn) return;
    btn.classList.remove('knapsack-btn-error');
    void btn.offsetWidth;
    btn.classList.add('knapsack-btn-error');
    setTimeout(() => btn.classList.remove('knapsack-btn-error'), 600);
  }

  // ── Snapshot helpers ──────────────────────────────────────────────────────

  function pushSnap(next: Snapshot) {
    setSnapshots(prev => [...prev.slice(0, stepIndex + 1), next]);
    setStepIndex(i => i + 1);
  }

  function applyChoice(include: boolean) {
    const item = items[curR - 1];
    const newF = f.map(row => [...row]);
    const newS = S.map(row => row.map(cell => (cell !== null ? [...cell] : null)));

    if (include) {
      newF[curR][curS] = item.value + f[curR - 1][curS - item.weight]!;
      newS[curR][curS] = [...S[curR - 1][curS - item.weight]!, curR];
    } else {
      newF[curR][curS] = f[curR - 1][curS]!;
      newS[curR][curS] = [...S[curR - 1][curS]!];
    }

    let nextR = curR, nextS = curS;
    if (curS < b) nextS++;
    else { nextR++; nextS = 1; }

    pushSnap({ phase: nextR > itemCount ? 'done' : 'filling', curR: nextR, curS: nextS, f: newF, S: newS });
  }

  // ── Click handlers ────────────────────────────────────────────────────────

  function handleInclude() {
    const item = items[curR - 1];
    if (curS < item.weight) {
      shakeBtn(includeBtnRef);
      showToast(
        `Item ${curR} weighs ${item.weight}, but the weight limit here is only ${curS} — it cannot be included.`
      );
      return;
    }
    const inclVal = item.value + f[curR - 1][curS - item.weight]!;
    const exclVal = f[curR - 1][curS]!;
    if (inclVal < exclVal) {
      shakeBtn(includeBtnRef);
      showToast(
        `Including item ${curR}: v${curR} + f[${curR - 1}][${curS - item.weight}] = ` +
        `${item.value} + ${f[curR - 1][curS - item.weight]} = ${inclVal}. ` +
        `Excluding: f[${curR - 1}][${curS}] = ${exclVal}. Excluding gives higher value.`
      );
      return;
    }
    applyChoice(true);
  }

  function handleExclude() {
    const item = items[curR - 1];
    if (curS >= item.weight) {
      const inclVal = item.value + f[curR - 1][curS - item.weight]!;
      const exclVal = f[curR - 1][curS]!;
      if (inclVal > exclVal) {
        shakeBtn(excludeBtnRef);
        showToast(
          `Excluding item ${curR}: f[${curR - 1}][${curS}] = ${exclVal}. ` +
          `Including gives v${curR} + f[${curR - 1}][${curS - item.weight}] = ` +
          `${item.value} + ${f[curR - 1][curS - item.weight]} = ${inclVal}, which is higher.`
        );
        return;
      }
    }
    applyChoice(false);
  }

  // ── Prev / Next ───────────────────────────────────────────────────────────

  function goPrev() {
    if (stepIndex === 0) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    setStepIndex(i => i - 1);
  }

  function goNext() {
    if (phase === 'done') return;
    const item = items[curR - 1];
    const include =
      curS >= item.weight &&
      item.value + f[curR - 1][curS - item.weight]! > f[curR - 1][curS]!;
    applyChoice(include);
  }

  // ── Reset / New problem ───────────────────────────────────────────────────

  function clearTimers() { if (toastTimer.current) clearTimeout(toastTimer.current); }

  function reset() {
    clearTimers();
    setSnapshots([makeInitSnapshot(items, b)]);
    setStepIndex(0);
    setToast(null);
  }

  function newProblem() {
    clearTimers();
    const inst = makeInstance(n);
    setInstance(inst);
    setSnapshots([makeInitSnapshot(inst.items, inst.b)]);
    setStepIndex(0);
    setToast(null);
  }

  // ── Cell styling ──────────────────────────────────────────────────────────

  function isCurrent(r: number, s: number) {
    return phase === 'filling' && r === curR && s === curS;
  }

  function isRef(r: number, s: number) {
    if (phase !== 'filling') return false;
    const w = items[curR - 1].weight;
    return (r === curR - 1 && s === curS) || (curS >= w && r === curR - 1 && s === curS - w);
  }

  function cellStyle(r: number, s: number): React.CSSProperties {
    const base: React.CSSProperties = { minWidth: '52px', padding: '4px 6px', textAlign: 'center', fontSize: '0.82em' };
    if (phase === 'done' && r === itemCount && s === b) return { ...base, border: '2px solid #16a34a', background: 'rgba(22,163,74,0.12)' };
    if (isCurrent(r, s)) return { ...base, border: '2px solid #2563eb', background: 'rgba(37,99,235,0.10)' };
    if (isRef(r, s))     return { ...base, border: '2px solid #d97706', background: 'rgba(217,119,6,0.10)' };
    if (r === 0 || s === 0) return { ...base, border: '1px solid var(--border)', background: 'color-mix(in srgb, currentColor 4%, var(--bg))' };
    return { ...base, border: '1px solid var(--border)' };
  }

  function fmtS(set: number[] | null) {
    if (set === null) return '';
    return set.length === 0 ? '∅' : `{${set.join(',')}}`;
  }

  // ── Status ────────────────────────────────────────────────────────────────

  const statusMsg = (() => {
    if (phase === 'done') {
      const val = f[itemCount][b]!;
      const sel = S[itemCount][b]!;
      return sel.length === 0
        ? 'No items fit within the weight limit.'
        : <>Maximum value <em>f</em><sub>{itemCount}</sub>({b}) = {val}, using item{sel.length > 1 ? 's' : ''} {'{' + sel.join(', ') + '}'}.</>;
    }
    const item = items[curR - 1];
    return <>Fill in <em>f</em><sub>{curR}</sub>({curS}): should item {curR} (weight {item.weight}, value {item.value}) be included?</>;
  })();

  const finalSelected = phase === 'done' ? new Set(S[itemCount][b] ?? []) : null;

  const prevSnap = phase === 'done' && stepIndex > 0 ? snapshots[stepIndex - 1] : snap;
  const dispR = prevSnap.curR;
  const dispS = prevSnap.curS;
  const dispF = prevSnap.f;
  const iterItem = items[dispR - 1];
  const iterFPrevS = dispF[dispR - 1][dispS];
  const iterFPrevSMinusW = dispS >= iterItem.weight ? dispF[dispR - 1][dispS - iterItem.weight] : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <style>{`
        @keyframes knapsack-toast { 0%,70% { opacity:1 } 100% { opacity:0 } }
        @keyframes knapsack-shake {
          0%,100% { transform:translateX(0) }
          20%     { transform:translateX(-5px) }
          40%     { transform:translateX(5px) }
          60%     { transform:translateX(-5px) }
          80%     { transform:translateX(5px) }
        }
        .knapsack-btn-error { animation: knapsack-shake 0.4s ease; border-color: #dc2626 !important; color: #dc2626 !important; }
      `}</style>

      <button onClick={newProblem}>New problem</button>

      {/* Items table */}
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>item <em>j</em></th>
            <th style={thStyle}>weight <em>w<sub>j</sub></em></th>
            <th style={thStyle}>value <em>v<sub>j</sub></em></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const j = i + 1;
            const active = phase === 'filling' && curR === j;
            const selected = finalSelected?.has(j) ?? false;
            return (
              <tr key={i} style={{
                background: selected ? 'rgba(22,163,74,0.12)' : active ? 'rgba(37,99,235,0.08)' : undefined,
                fontWeight: selected || active ? 600 : 400,
                color: selected ? '#16a34a' : undefined,
              }}>
                <td style={tdBase}>{j}</td>
                <td style={tdBase}>{item.weight}</td>
                <td style={tdBase}>{item.value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontSize: '0.82em', color: 'var(--text-muted)' }}>
        Weight limit: <em>b</em> = {b}
      </div>

      {/* DP table */}
      <div style={{ overflowX: 'auto', width: '100%', position: 'relative' }}>
        <table style={{ borderCollapse: 'collapse', margin: '0 auto' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, borderRight: '2px solid var(--text-muted)', fontSize: '0.78em' }}>
                <em>r</em> \ <em>s</em>
              </th>
              {Array.from({ length: b + 1 }, (_, s) => (
                <th key={s} style={thStyle}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: itemCount + 1 }, (_, r) => (
              <tr key={r}>
                <td style={{ ...thStyle, borderRight: '2px solid var(--text-muted)', fontStyle: 'italic' }}>
                  {r}
                </td>
                {Array.from({ length: b + 1 }, (_, s) => {
                  const fVal = f[r][s];
                  const sVal = S[r][s];
                  return (
                    <td key={s} style={cellStyle(r, s)}>
                      {fVal !== null ? (
                        <>
                          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{fVal}</div>
                          <div style={{ fontSize: '0.78em', color: 'var(--text-muted)', lineHeight: 1.1 }}>{fmtS(sVal)}</div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {toast && (
          <div key={toast.key} style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            background: 'rgba(15,15,15,0.85)', color: '#fff',
            padding: '10px 20px', borderRadius: '6px',
            fontSize: '0.85em', maxWidth: '340px', textAlign: 'center',
            pointerEvents: 'none', zIndex: 10,
            animation: 'knapsack-toast 3.5s ease forwards',
          }}>
            {toast.msg}
          </div>
        )}
      </div>

      {/* Include / Exclude */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}><em>r</em></th>
              <th style={thStyle}><em>s</em></th>
              <th style={thStyle}><em>w<sub>r</sub></em></th>
              <th style={thStyle}><em>v<sub>r</sub></em></th>
              <th style={thStyle}><em>f</em><sub><em>r</em>−1</sub>(<em>s</em>−<em>w<sub>r</sub></em>)</th>
              <th style={thStyle}><em>f</em><sub><em>r</em>−1</sub>(<em>s</em>)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdBase}>{dispR}</td>
              <td style={tdBase}>{dispS}</td>
              <td style={tdBase}>{iterItem.weight}</td>
              <td style={tdBase}>{iterItem.value}</td>
              <td style={tdBase}>{iterFPrevSMinusW !== null ? iterFPrevSMinusW : '−∞'}</td>
              <td style={tdBase}>{iterFPrevS}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button ref={includeBtnRef} onClick={handleInclude} disabled={phase !== 'filling'}>
          Include item {phase === 'filling' ? curR : ''}
        </button>
        <button ref={excludeBtnRef} onClick={handleExclude} disabled={phase !== 'filling'}>
          Exclude item {phase === 'filling' ? curR : ''}
        </button>
        </div>
      </div>

      {/* Prev / Reset / Next */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button onClick={goPrev} disabled={stepIndex === 0}>← Prev</button>
        <button
          onClick={phase === 'done' ? reset : () => {}}
          style={{ visibility: phase === 'done' ? 'visible' : 'hidden' }}
        >
          Reset
        </button>
        <button onClick={goNext} disabled={phase === 'done'}>Next →</button>
      </div>

      {/* Status */}
      <div style={{
        fontSize: '0.9em', textAlign: 'center', maxWidth: '480px',
        color: phase === 'done' ? '#16a34a' : 'var(--text-muted)',
        fontWeight: phase === 'done' ? 600 : 400,
      }}>
        {statusMsg}
      </div>
    </div>
  );
}
