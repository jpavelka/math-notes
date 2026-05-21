
import registryJson from 'virtual:astro-math-book/registry';
import { renderInlineMath } from './renderInlineMath';

const registry = registryJson;

interface Props {
  id: string;
  altLabel?: string;
  useTitle?: boolean;
  short?: boolean;
  textTransform?: 'lowercase' | 'uppercase' | 'capitalize';
}

function applyTextTransform(str: string, transform: 'lowercase' | 'uppercase' | 'capitalize'): string {
  const fn =
    transform === 'lowercase' ? (s: string) => s.toLowerCase() :
    transform === 'uppercase' ? (s: string) => s.toUpperCase() :
    (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
  return str.split(/(\$[^$]+\$)/).map((part, i) => i % 2 === 0 ? fn(part) : part).join('');
}

export function Ref({ id, altLabel, useTitle, short, textTransform }: Props) {
  const entry = registry[id];
  if (!entry) {
    return <span className="ref ref--unknown" title={`Unknown reference: ${id}`}>[?:{id}]</span>;
  }

  // entry.kind is present in registries built after the kind field was added.
  // Fall back to type-name checks for older registry.json files.
  const isEquation = entry.kind === 'equation' || (entry.kind == null && entry.type === 'Equation');
  const isSection  = entry.kind === 'section'  || (entry.kind == null && entry.type === 'Section');
  const isChapter  = entry.kind === 'chapter';
  const isFloat    = entry.kind === 'float'    || (entry.kind == null && ['Figure', 'Table', 'Video'].includes(entry.type));
  const isAlgoLine = entry.kind === 'algoline';
  const isEnvStyled = !isEquation && !isSection && !isChapter && !isFloat && !isAlgoLine;

  let label: string;
  if (isEquation) {
    label = `(${entry.label ?? entry.number})`;
  } else if (isSection) {
    label = `§${entry.number}`;
  } else if (isChapter) {
    label = entry.label ?? (typeof entry.number === 'string' ? `Appendix ${entry.number}` : `Chapter ${entry.number}`);
  } else if (isAlgoLine) {
    const algoRef = (entry as any).algoLabel ?? `Algorithm ${(entry as any).algoNumber}`;
    label = entry.label ?? (short ? `line ${entry.number}` : `${algoRef}, line ${entry.number}`);
  } else {
    label = entry.label ?? `${entry.type} ${entry.number}`;
  }

  const bodyHTML = entry.contentHTML
    .replace(/<p>/g, '<span style="display:block;margin:0.25em 0">')
    .replace(/<\/p>/g, '</span>');

  let tooltipHTML: string;
  let tooltipClass = 'ref-tooltip';
  let tooltipStyle: Record<string, string> | undefined;

  if (isAlgoLine) {
    const algoRef = (entry as any).algoLabel ?? `Algorithm ${(entry as any).algoNumber}`;
    const lineView = `<span class="ref-algo-view ref-algo-view--line"><span style="display:block;margin-bottom:0.3em"><strong>${algoRef}, line ${entry.number}</strong></span>${bodyHTML}</span>`;
    const algoEntry = (registry as any)[(entry as any).algoId];
    let fullView = '';
    let toggleBtn = '';
    if (algoEntry) {
      const algoTitleHTML = algoEntry.title ? `. <em>${renderInlineMath(algoEntry.title)}</em>` : '';
      const algoHeaderHTML = `<span style="display:block;margin-bottom:0.4em"><strong>${algoEntry.type} ${algoEntry.number}</strong>${algoTitleHTML}</span>`;
      const algoBodyHTML = algoEntry.contentHTML
        .replace(/<p>/g, '<span style="display:block;margin:0.25em 0">')
        .replace(/<\/p>/g, '</span>');
      const targetLine = parseInt(entry.number, 10);
      let algoLineCount = 0;
      const highlightedAlgoBodyHTML = algoBodyHTML.replace(
        /<span class="(algo-line[^"]*)"/g,
        (_match, classes: string) => {
          if (classes.includes('algo-comment')) return `<span class="${classes}"`;
          algoLineCount++;
          if (algoLineCount === targetLine) return `<span class="${classes} algo-line--ref-highlight"`;
          return `<span class="${classes}"`;
        }
      );
      fullView = `<span class="ref-algo-view ref-algo-view--full" style="counter-reset:algo-line">${algoHeaderHTML}${highlightedAlgoBodyHTML}</span>`;
      toggleBtn = `<button class="ref-algo-toggle" onclick="var t=this.closest('.ref-algo-toggle-root');t.dataset.algoView=t.dataset.algoView==='full'?'':'full'"><span class="ref-algo-toggle__to-full">Full algorithm ↓</span><span class="ref-algo-toggle__to-line">Referenced line ↑</span></button>`;
    }
    tooltipHTML = `<span class="ref-algo-toggle-root">${lineView}${fullView}${toggleBtn}</span>`;
  } else if (isEquation) {
    tooltipHTML = bodyHTML;
  } else if (isSection) {
    const titleHTML = entry.title ? `: <em>${renderInlineMath(entry.title)}</em>` : '';
    tooltipHTML = `<strong>Section ${entry.number}</strong>${titleHTML}`;
  } else if (isChapter) {
    const prefix = typeof entry.number === 'string' ? `Appendix ${entry.number}` : `Chapter ${entry.number}`;
    const titleHTML = entry.title ? `: <em>${renderInlineMath(entry.title)}</em>` : '';
    tooltipHTML = `<strong>${prefix}</strong>${titleHTML}`;
  } else {
    const isCaption = isFloat;
    const titleHTML = entry.title
      ? isCaption
        ? `. <em>${renderInlineMath(entry.title)}</em>`
        : ` <em>(${renderInlineMath(entry.title)})</em>`
      : '';
    const labelHTML = `<span style="display:block;margin-bottom:0.4em"><strong>${entry.type} ${entry.number}</strong>${titleHTML}</span>`;
    tooltipHTML = labelHTML + bodyHTML;
    if (entry.type === 'Algorithm') {
      tooltipStyle = { counterReset: 'algo-line' };
    }
    if (isEnvStyled) {
      const envType = entry.type.toLowerCase();
      tooltipClass += ' ref-tooltip--env';
      tooltipStyle = {
        borderLeftColor: `var(--env-${envType}-border)`,
        background: `var(--env-${envType}-bg)`,
        '--ref-tooltip-bg': `var(--env-${envType}-bg)`,
      };
    }
  }

  const pinButton = `<button class="ref-pin-btn" aria-label="Pin tooltip"><svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.708V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/></svg></button>`;

  const displayText = altLabel ?? (useTitle && entry.title ? entry.title : label);
  const displayHTML = renderInlineMath(textTransform ? applyTextTransform(displayText, textTransform) : displayText);

  return (
    <span className="ref" {...(entry.type === 'Figure' ? { 'data-figure-id': entry.id } : {})}>
      <a href={entry.href} className="ref-link" dangerouslySetInnerHTML={{ __html: displayHTML }} />
      <span
        className={tooltipClass}
        style={tooltipStyle as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: pinButton + tooltipHTML }}
      />
    </span>
  );
}
