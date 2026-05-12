/**
 * Astro integration: parses references.bib at build start and writes
 * .astro/bibliography.json with formatted entries for use by Cite and
 * Bibliography components.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── BibTeX parser ────────────────────────────────────────────────────────────

function parseBibtex(source) {
  const entries = [];
  let i = 0;

  while (i < source.length) {
    const atIdx = source.indexOf('@', i);
    if (atIdx === -1) break;
    i = atIdx + 1;

    const typeMatch = source.slice(i).match(/^(\w+)\s*\{/);
    if (!typeMatch) continue;
    const type = typeMatch[1].toLowerCase();
    i += typeMatch[0].length;

    // Skip non-entry blocks
    if (type === 'comment' || type === 'string' || type === 'preamble') {
      let depth = 1;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
      }
      continue;
    }

    const keyEnd = source.indexOf(',', i);
    if (keyEnd === -1) break;
    const key = source.slice(i, keyEnd).trim();
    i = keyEnd + 1;

    const fields = {};
    let depth = 1;
    outer: while (i < source.length && depth > 0) {
      while (i < source.length && /\s/.test(source[i])) i++;
      if (source[i] === '}') { i++; break; }

      const fieldMatch = source.slice(i).match(/^(\w+)\s*=\s*/);
      if (!fieldMatch) {
        // Skip to next comma or closing brace
        while (i < source.length && source[i] !== ',' && source[i] !== '}') i++;
        if (source[i] === ',') i++;
        continue;
      }
      const fieldName = fieldMatch[1].toLowerCase();
      i += fieldMatch[0].length;

      let value = '';
      if (source[i] === '{') {
        let d = 1; i++;
        const start = i;
        while (i < source.length && d > 0) {
          if (source[i] === '{') d++;
          else if (source[i] === '}') d--;
          i++;
        }
        value = source.slice(start, i - 1);
      } else if (source[i] === '"') {
        i++;
        const start = i;
        while (i < source.length && source[i] !== '"') i++;
        value = source.slice(start, i);
        i++;
      } else {
        const numMatch = source.slice(i).match(/^[\w]+/);
        if (numMatch) { value = numMatch[0]; i += numMatch[0].length; }
      }

      fields[fieldName] = value;
      while (i < source.length && /\s/.test(source[i])) i++;
      if (source[i] === ',') i++;
    }

    entries.push({ key, type, fields });
  }

  return entries;
}

// ── LaTeX → plain text ───────────────────────────────────────────────────────

const LATEX_CHARS = {
  "\\'a": 'á', "\\'e": 'é', "\\'i": 'í', "\\'o": 'ó', "\\'u": 'ú',
  "\\'A": 'Á', "\\'E": 'É', "\\'I": 'Í', "\\'O": 'Ó', "\\'U": 'Ú',
  '\\`a': 'à', '\\`e': 'è', '\\`i': 'ì', '\\`o': 'ò', '\\`u': 'ù',
  '\\^a': 'â', '\\^e': 'ê', '\\^i': 'î', '\\^o': 'ô', '\\^u': 'û',
  '\\"a': 'ä', '\\"e': 'ë', '\\"i': 'ï', '\\"o': 'ö', '\\"u': 'ü',
  '\\"A': 'Ä', '\\"E': 'Ë', '\\"O': 'Ö', '\\"U': 'Ü',
  '\\~n': 'ñ', '\\~N': 'Ñ', '\\c{c}': 'ç', '\\c{C}': 'Ç',
  '\\ss': 'ß', '--': '–', '---': '—',
};

function latexToText(s) {
  if (!s) return '';
  // Strip case-protection braces e.g. {Einstein} → Einstein
  s = s.replace(/\{([^{}]*)\}/g, '$1');
  for (const [k, v] of Object.entries(LATEX_CHARS)) s = s.replaceAll(k, v);
  // Remove remaining simple commands like \LaTeX, \TeX
  s = s.replace(/\\[A-Za-z]+\s*/g, '');
  return s.trim();
}

// ── Author parsing ───────────────────────────────────────────────────────────

function parseAuthors(authorStr) {
  if (!authorStr) return [];
  return authorStr.split(/\s+and\s+/i).map(a => {
    a = latexToText(a.trim());
    if (a.includes(',')) {
      const [last, first] = a.split(',').map(s => s.trim());
      return { first, last };
    }
    const parts = a.split(/\s+/);
    return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' ') };
  });
}

function authorLabel(authors) {
  if (authors.length === 0) return 'Unknown';
  if (authors.length === 1) return authors[0].last;
  if (authors.length === 2) return `${authors[0].last} & ${authors[1].last}`;
  return `${authors[0].last} et al.`;
}

function authorListFormatted(authors) {
  return authors.map(({ first, last }) => {
    const initials = first.split(/\s+/).map(p => p[0] ? p[0] + '.' : '').join(' ');
    return last + (initials ? `, ${initials}` : '');
  }).join(', ');
}

// ── Entry formatter → HTML ───────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatEntry(entry) {
  const f = entry.fields;
  const authors = parseAuthors(f.author ?? f.editor ?? '');
  const year = latexToText(f.year ?? '');
  const title = latexToText(f.title ?? '');
  const pages = latexToText(f.pages ?? '').replace('--', '–');

  const authorStr = esc(authorListFormatted(authors));
  const yearStr = esc(year);
  const titleStr = esc(title);

  let detail = '';
  switch (entry.type) {
    case 'article': {
      const journal = esc(latexToText(f.journal ?? ''));
      const vol = f.volume ? esc(latexToText(f.volume)) : '';
      const num = f.number ? `(${esc(latexToText(f.number))})` : '';
      const pp = pages ? `, ${esc(pages)}` : '';
      detail = `<em>${journal}</em>${vol ? `, ${vol}${num}` : ''}${pp}.`;
      break;
    }
    case 'book':
    case 'booklet': {
      const pub = esc(latexToText(f.publisher ?? ''));
      detail = `<em>${titleStr}</em>. ${pub}.`;
      break;
    }
    case 'inproceedings':
    case 'conference': {
      const booktitle = esc(latexToText(f.booktitle ?? ''));
      const pp = pages ? ` (pp. ${esc(pages)})` : '';
      detail = `In <em>${booktitle}</em>${pp}.`;
      break;
    }
    case 'phdthesis':
    case 'mastersthesis': {
      const school = esc(latexToText(f.school ?? ''));
      const kind = entry.type === 'phdthesis' ? 'PhD thesis' : 'Master\'s thesis';
      detail = `${kind}. ${school}.`;
      break;
    }
    case 'techreport': {
      const inst = esc(latexToText(f.institution ?? ''));
      detail = `Technical report. ${inst}.`;
      break;
    }
    default: {
      const pub = f.publisher ? esc(latexToText(f.publisher)) : '';
      detail = pub ? `${pub}.` : '';
      break;
    }
  }

  const urlPart = f.url ? ` <a href="${esc(f.url)}">${esc(f.url)}</a>` : '';

  // Books italicise the title in the header; others show it plainly then detail
  const isBook = entry.type === 'book' || entry.type === 'booklet';
  const titlePart = isBook ? '' : `${titleStr}. `;

  return `${authorStr} (${yearStr}). ${titlePart}${detail}${urlPart}`;
}

// ── Main builder ─────────────────────────────────────────────────────────────

function buildBibliography(root) {
  const bibPath = join(root, 'references.bib');
  if (!existsSync(bibPath)) {
    console.warn('[bibliography] references.bib not found — skipping');
    return;
  }

  const source = readFileSync(bibPath, 'utf-8');
  const entries = parseBibtex(source);

  const bibliography = {};
  for (const entry of entries) {
    const authors = parseAuthors(entry.fields.author ?? entry.fields.editor ?? '');
    const year = latexToText(entry.fields.year ?? '');
    bibliography[entry.key] = {
      key: entry.key,
      type: entry.type,
      label: `${authorLabel(authors)}, ${year}`,
      sortKey: (authors[0]?.last ?? '').toLowerCase() + year,
      formatted: formatEntry(entry),
      ...(entry.fields.image ? { image: entry.fields.image.trim() } : {}),
    };
  }

  const astroDir = join(root, '.astro');
  mkdirSync(astroDir, { recursive: true });
  writeFileSync(join(astroDir, 'bibliography.json'), JSON.stringify(bibliography, null, 2));
  console.log(`[bibliography] ${entries.length} entries → .astro/bibliography.json`);
}

// ── Astro integration ────────────────────────────────────────────────────────

export function bibliographyIntegration() {
  let projectRoot;
  return {
    name: 'astro-bibliography',
    hooks: {
      'astro:config:done': ({ config }) => {
        projectRoot = config.root instanceof URL
          ? fileURLToPath(config.root)
          : String(config.root);
      },
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [{
              name: 'astro-bibliography-build',
              buildStart() {
                if (!projectRoot) return;
                this.addWatchFile(join(projectRoot, 'references.bib'));
                buildBibliography(projectRoot);
              },
              watchChange(id) {
                if (projectRoot && id === join(projectRoot, 'references.bib')) {
                  buildBibliography(projectRoot);
                }
              },
            }],
          },
        });
      },
    },
  };
}
