import puppeteer from 'puppeteer';
import { PDFDocument, PDFName, PDFNumber, PDFString, PDFRef, PDFDict, PDFArray, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { readdir, mkdir, rm, symlink, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const ROOT = process.cwd();  // always the project root when invoked via `npm run`
const PREFERRED_PORT = 4322;
const OUT = join(ROOT, 'pdfs');
const CHAPTERS_OUT = join(OUT, 'chapters');

// ─── outline extraction ────────────────────────────────────────────────────

interface OutlineEntry {
  title: string;
  pageIndex: number;  // 0-based within source PDF
  x: number | null;
  y: number | null;
  zoom: number | null;
  children: OutlineEntry[];
}

function resolveRef(ctx: PDFDocument['context'], obj: unknown): unknown {
  return (obj instanceof PDFRef) ? ctx.lookup(obj) : obj;
}

function getText(obj: unknown): string {
  if (!obj) return '';
  // pdf-lib represents PDF strings as PDFString or PDFHexString, both have decodeText()
  if (typeof (obj as any).decodeText === 'function') return (obj as any).decodeText();
  return (obj as any).toString?.() ?? '';
}

function extractOutlineFromDoc(doc: PDFDocument): OutlineEntry[] {
  const ctx = doc.context;
  const pages = doc.getPages();
  const pageRefToIndex = new Map<string, number>(
    pages.map((p, i) => [p.ref.toString(), i])
  );

  function parseDest(dest: unknown): Pick<OutlineEntry, 'pageIndex' | 'x' | 'y' | 'zoom'> {
    const arr = resolveRef(ctx, dest);
    if (!(arr instanceof PDFArray) || arr.size() < 2) return { pageIndex: 0, x: null, y: null, zoom: null };
    const pageRef = arr.get(0);
    const pageIndex = pageRefToIndex.get(pageRef?.toString() ?? '') ?? 0;
    // [page /XYZ x y zoom] or [page /Fit] etc.
    const type = resolveRef(ctx, arr.get(1));
    if (type?.toString() === '/XYZ') {
      const x = (resolveRef(ctx, arr.get(2)) as any)?.asNumber?.() ?? null;
      const y = (resolveRef(ctx, arr.get(3)) as any)?.asNumber?.() ?? null;
      const zoom = (resolveRef(ctx, arr.get(4)) as any)?.asNumber?.() ?? null;
      return { pageIndex, x, y, zoom };
    }
    return { pageIndex, x: null, y: null, zoom: null };
  }

  function walkItems(itemRef: unknown): OutlineEntry[] {
    const items: OutlineEntry[] = [];
    let cur = resolveRef(ctx, itemRef);
    while (cur instanceof PDFDict) {
      const rawTitle = resolveRef(ctx, cur.get(PDFName.of('Title')));
      const title = getText(rawTitle);
      const dest = parseDest(cur.get(PDFName.of('Dest')));
      const firstChild = cur.get(PDFName.of('First'));
      const children = firstChild ? walkItems(firstChild) : [];
      items.push({ title, ...dest, children });
      const next = cur.get(PDFName.of('Next'));
      cur = next ? resolveRef(ctx, next) : null;
    }
    return items;
  }

  const outlinesObj = resolveRef(ctx, doc.catalog.get(PDFName.of('Outlines')));
  if (!(outlinesObj instanceof PDFDict)) return [];
  const first = outlinesObj.get(PDFName.of('First'));
  if (!first) return [];
  return walkItems(first);
}

// ─── outline writing ───────────────────────────────────────────────────────

// ─── link fixing ──────────────────────────────────────────────────────────

interface AnchorDest { pageRef: PDFRef; x: number | null; y: number | null }

// Remove URI link annotations that point to localhost from a standalone chapter
// PDF. Those links can never resolve in a document that doesn't contain the
// other chapters, so removing them is better than having them open a browser.
function stripExternalLocalhostLinks(doc: PDFDocument) {
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const annotsRaw = page.node.get(PDFName.of('Annots'));
    const annots = resolveRef(ctx, annotsRaw);
    if (!(annots instanceof PDFArray)) continue;
    const kept: unknown[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const entry = annots.get(i);
      const ann = resolveRef(ctx, entry);
      if (ann instanceof PDFDict) {
        const action = resolveRef(ctx, ann.get(PDFName.of('A')));
        if (action instanceof PDFDict && action.get(PDFName.of('S'))?.toString() === '/URI') {
          const uri = getText(action.get(PDFName.of('URI')));
          if (/^https?:\/\/localhost:\d+\//.test(uri)) continue; // drop it
        }
      }
      kept.push(entry);
    }
    page.node.set(PDFName.of('Annots'), ctx.obj(kept));
  }
}

// Convert every URI link annotation that points to localhost (the Astro preview
// server URL baked in by Chrome during PDF generation) into an internal GoTo
// destination, using the named-destination maps extracted from each chapter PDF.
function fixLinks(
  doc: PDFDocument,
  // slug (lowercase) → { first-page offset in merged doc, anchor → dest }
  slugMap: Map<string, { pageOffset: number; anchors: Map<string, AnchorDest> }>,
) {
  const ctx = doc.context;
  const pages = doc.getPages();

  for (const page of pages) {
    const annotsRaw = page.node.get(PDFName.of('Annots'));
    const annots = resolveRef(ctx, annotsRaw);
    if (!(annots instanceof PDFArray)) continue;

    for (let i = 0; i < annots.size(); i++) {
      const ann = resolveRef(ctx, annots.get(i));
      if (!(ann instanceof PDFDict)) continue;

      const actionRaw = ann.get(PDFName.of('A'));
      const action = resolveRef(ctx, actionRaw);
      if (!(action instanceof PDFDict)) continue;
      if (action.get(PDFName.of('S'))?.toString() !== '/URI') continue;

      const uriRaw = action.get(PDFName.of('URI'));
      const uri = getText(uriRaw);

      const m = uri.match(/^https?:\/\/localhost:\d+\/([^#]*?)(?:#(.*))?$/);
      if (!m) continue;

      const [, rawSlug, anchor] = m;
      const slug = rawSlug.toLowerCase();

      // Find the chapter, falling back to stripping a leading letter+dash
      // (handles e.g. bibliographyHref: '/d-references' → references chapter)
      let info = slugMap.get(slug) ?? slugMap.get(slug.replace(/^[a-z]-/, ''));
      if (!info) continue;

      const dest = anchor ? info.anchors.get(anchor) : undefined;
      const pageRef = dest?.pageRef ?? pages[info.pageOffset].ref;
      const x = dest?.x ?? null;
      const y = dest?.y ?? null;

      ann.delete(PDFName.of('A'));
      ann.set(PDFName.of('Dest'), ctx.obj([pageRef, PDFName.of('XYZ'), x, y, null]));
    }
  }
}

function buildOutline(
  doc: PDFDocument,
  // entries are top-level per chapter; pageOffset shifts all page indices
  chapters: Array<{ entries: OutlineEntry[]; pageOffset: number; chapterNum: string | null }>,
) {
  if (chapters.every(c => c.entries.length === 0)) return;

  const ctx = doc.context;
  const pages = doc.getPages();
  const outlinesRef = ctx.nextRef();

  function applyOffset(e: OutlineEntry, offset: number): OutlineEntry {
    return { ...e, pageIndex: e.pageIndex + offset, children: e.children.map(c => applyOffset(c, offset)) };
  }

  function writeItems(
    entries: OutlineEntry[],
    parentRef: PDFRef,
    numbering: string | null,  // e.g. "1", "1.2", "A" — null = no numbering
  ): { first: PDFRef; last: PDFRef } {
    const refs = entries.map(() => ctx.nextRef());

    entries.forEach((entry, i) => {
      const num = numbering !== null ? `${numbering}.${i + 1}` : null;
      const displayTitle = num !== null ? `${num}  ${latexToUnicode(entry.title)}` : latexToUnicode(entry.title);

      const pageRef = pages[Math.min(entry.pageIndex, pages.length - 1)].ref;
      const destArr: unknown[] = [pageRef, PDFName.of('XYZ'),
        entry.x !== null ? PDFNumber.of(entry.x) : null,
        entry.y !== null ? PDFNumber.of(entry.y) : null,
        entry.zoom !== null ? PDFNumber.of(entry.zoom) : null,
      ];
      const dict: Record<string, unknown> = {
        Title: unicodePdfString(displayTitle),
        Parent: parentRef,
        Dest: ctx.obj(destArr),
      };
      if (i > 0) dict.Prev = refs[i - 1];
      if (i < refs.length - 1) dict.Next = refs[i + 1];

      const isNotation = /^notation\b/i.test(entry.title.trim());
      if (entry.children.length > 0 && !isNotation) {
        const { first, last } = writeItems(entry.children, refs[i], num);
        dict.First = first;
        dict.Last = last;
        // Negative count = subtree is collapsed by default
        dict.Count = PDFNumber.of(-entry.children.length);
      } else {
        dict.Count = PDFNumber.of(0);
      }

      ctx.assign(refs[i], ctx.obj(dict));
    });

    return { first: refs[0], last: refs[refs.length - 1] };
  }

  // Top level: each chapter is one entry; number its children using the chapter prefix.
  // We write one entry per chapter rather than one call per chapter so siblings link correctly.
  const chapterRefs = chapters.map(() => ctx.nextRef());
  chapters.forEach(({ entries, pageOffset, chapterNum }, ci) => {
    if (entries.length === 0) return;
    const entry = applyOffset(entries[0], pageOffset);  // the H1 entry for this chapter
    const chRef = chapterRefs[ci];

    const pageRef = pages[Math.min(entry.pageIndex, pages.length - 1)].ref;
    const destArr: unknown[] = [pageRef, PDFName.of('XYZ'),
      entry.x !== null ? PDFNumber.of(entry.x) : null,
      entry.y !== null ? PDFNumber.of(entry.y) : null,
      entry.zoom !== null ? PDFNumber.of(entry.zoom) : null,
    ];
    const displayTitle = chapterNum !== null ? `${chapterNum}  ${latexToUnicode(entry.title)}` : latexToUnicode(entry.title);
    const dict: Record<string, unknown> = {
      Title: unicodePdfString(displayTitle),
      Parent: outlinesRef,
      Dest: ctx.obj(destArr),
    };
    const prevNonEmpty = chapterRefs.slice(0, ci).filter((_, j) => chapters[j].entries.length > 0);
    const nextNonEmpty = chapterRefs.slice(ci + 1).filter((_, j) => chapters[ci + 1 + j].entries.length > 0);
    if (prevNonEmpty.length > 0) dict.Prev = prevNonEmpty[prevNonEmpty.length - 1];
    if (nextNonEmpty.length > 0) dict.Next = nextNonEmpty[0];

    // Children = the H2 entries (entry.children), already offset by applyOffset above.
    // Suppress subsections for notation-like chapters in the backmatter (non-numeric chapter numbers).
    const isNotationChapter = !/^\d+$/.test(chapterNum ?? '') && /^notation\b/i.test(entry.title.trim());
    if (entry.children.length > 0 && !isNotationChapter) {
      const { first: fc, last: lc } = writeItems(entry.children, chRef, chapterNum);
      dict.First = fc;
      dict.Last = lc;
      dict.Count = PDFNumber.of(-entry.children.length);
    } else {
      dict.Count = PDFNumber.of(0);
    }

    ctx.assign(chRef, ctx.obj(dict));
  });

  const nonEmptyRefs = chapterRefs.filter((_, i) => chapters[i].entries.length > 0);
  const { first, last } = { first: nonEmptyRefs[0], last: nonEmptyRefs[nonEmptyRefs.length - 1] };

  ctx.assign(outlinesRef, ctx.obj({
    Type: PDFName.of('Outlines'),
    Count: PDFNumber.of(nonEmptyRefs.length),
    First: first,
    Last: last,
  }));

  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

// ─── server / chrome helpers ───────────────────────────────────────────────

// Parse the actual port from astro's startup line: "Local    http://localhost:PORT/"
function startPreviewServer(): Promise<{ process: ReturnType<typeof spawn>; base: string }> {
  return new Promise((resolve, reject) => {
    const server = spawn(findAstroBin(ROOT), ['preview', '--port', String(PREFERRED_PORT)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    const settle = (base: string) => {
      if (settled) return;
      settled = true;
      resolve({ process: server, base });
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      const m = text.match(/Local\s+http:\/\/localhost:(\d+)/);
      if (m) settle(`http://localhost:${m[1]}`);
    };
    server.stdout?.on('data', onData);
    server.stderr?.on('data', onData);
    server.on('error', err => { if (!settled) reject(err); });
    server.on('exit', code => { if (!settled) reject(new Error(`Server exited with code ${code}`)); });

    setTimeout(() => { if (!settled) reject(new Error('Preview server did not print a ready URL')); }, 30_000);
  });
}

// Read one frontmatter field from an MDX file without a full YAML parser.
function readFrontmatterField(source: string, key: string): string | undefined {
  const m = source.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return undefined;
  const line = m[1].match(new RegExp(`^${key}:\\s*(.+)`, 'm'));
  return line?.[1].replace(/^["']|["']$/g, '').trim();
}

// Returns chapters sorted to match the BookLayout nav order:
//   primary key = order ?? chapter (numeric) ?? Infinity
//   tiebreaker  = original filesystem order (stable sort)
// Single uppercase letter chapter values (A, B, …) use char code (65, 66, …),
// placing lettered appendices after numeric chapters and before order:101+ back-matter.
async function collectChapters(dir: string): Promise<Array<{ slug: string; title: string; chapterNum: string | null; bookPart: string | null }>> {
  async function walk(d: string, prefix = ''): Promise<string[]> {
    const entries = await readdir(d, { withFileTypes: true });
    const results: string[] = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        results.push(...await walk(join(d, e.name), `${prefix}${e.name}/`));
      } else if (e.name.endsWith('.mdx')) {
        results.push(`${prefix}${e.name.slice(0, -4)}`);
      }
    }
    return results;
  }

  const slugs = (await walk(dir)).sort();

  const meta = await Promise.all(slugs.map(async (slug, i) => {
    const src = await readFile(join(dir, `${slug}.mdx`), 'utf8');
    const title = readFrontmatterField(src, 'title') ?? slug;
    const bookPart = readFrontmatterField(src, 'bookPart') ?? null;
    const order = readFrontmatterField(src, 'order');
    let key: number;
    let chapterNum: string | null = null;
    if (order !== undefined) {
      key = Number(order);
      // back-matter (order-only) gets no chapter number
    } else {
      const chapter = readFrontmatterField(src, 'chapter');
      if (chapter !== undefined) {
        const n = Number(chapter);
        if (!isNaN(n)) {
          key = n;
          chapterNum = String(n);
        } else if (/^[A-Z]$/.test(chapter)) {
          key = chapter.charCodeAt(0);
          chapterNum = chapter;
        } else {
          key = Infinity;
        }
      } else {
        key = Infinity;
      }
    }
    return { slug, title, key, i, chapterNum, bookPart };
  }));

  return meta
    .sort((a, b) => a.key !== b.key ? a.key - b.key : a.i - b.i)
    .map(({ slug, title, chapterNum, bookPart }) => ({ slug, title, chapterNum, bookPart }));
}

function findChrome(): string {
  const candidates = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const bin of candidates) {
    try {
      const p = execSync(`which ${bin}`, { stdio: 'pipe' }).toString().trim();
      if (p) return p;
    } catch {}
  }
  throw new Error('No Chrome/Chromium found. Install chromium or google-chrome.');
}

function findAstroBin(startDir: string): string {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, 'node_modules/.bin/astro');
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) throw new Error('Could not find astro binary in any node_modules/.bin');
    dir = parent;
  }
}

// Chromium on Linux needs fontconfig to find fonts. In this Nix environment
// /usr/share/fonts is empty, but Liberation + DejaVu TTFs exist in the Nix
// store. fontconfig's default config includes ~/.local/share/fonts, so we
// symlink the Nix TTFs there once if they aren't already present.
async function ensureFonts() {
  const FONT_DIRS = [
    '/nix/store/0l2dc446f8kyk1naz14dj0pgandriwma-liberation-fonts-2.1.5/share/fonts/truetype',
    '/nix/store/1mjlla0fc468wl9cphnn2ivpfx02mr7j-dejavu-fonts-minimal-2.37/share/fonts/truetype',
  ];
  const dest = join(homedir(), '.local/share/fonts');
  await mkdir(dest, { recursive: true });
  for (const dir of FONT_DIRS) {
    if (!existsSync(dir)) continue;
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.ttf')) continue;
      const target = join(dest, f);
      if (!existsSync(target)) {
        await symlink(join(dir, f), target).catch(() => {});
      }
    }
  }
}

async function readBookTitle(root: string): Promise<string> {
  const src = await readFile(join(root, 'config.ts'), 'utf8').catch(() => '');
  const m = src.match(/export const SITE_TITLE\s*=\s*['"](.+?)['"]/);
  return m?.[1] ?? 'book';
}

const LATEX_CMD_MAP: Record<string, string> = {
  // Greek lowercase
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  // Greek uppercase
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // Relations
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅',
  subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  in: '∈', notin: '∉', ni: '∋', ll: '≪', gg: '≫',
  prec: '≺', preceq: '⪯', succ: '≻', succeq: '⪰',
  // Operators / logic
  cup: '∪', cap: '∩', setminus: '∖', times: '×',
  cdot: '·', circ: '∘', pm: '±', mp: '∓', div: '÷',
  oplus: '⊕', otimes: '⊗',
  wedge: '∧', land: '∧', vee: '∨', lor: '∨', lnot: '¬', neg: '¬',
  // Misc
  infty: '∞', partial: '∂', nabla: '∇',
  forall: '∀', exists: '∃', nexists: '∄',
  emptyset: '∅', varnothing: '∅',
  ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮', ddots: '⋱',
  mid: '∣', nmid: '∤', perp: '⊥',
  int: '∫', sum: '∑', prod: '∏',
  // Arrows
  to: '→', gets: '←',
  rightarrow: '→', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  mapsto: '↦', implies: '⟹', iff: '⟺',
};

// Convert LaTeX math markup in a string to Unicode equivalents.
// Designed for section/chapter headings — handles common symbols and strips
// unknown commands gracefully rather than leaving raw markup.
function latexToUnicode(text: string): string {
  let s = text;
  // Strip display math (shouldn't appear in headings, but be safe)
  s = s.replace(/\$\$[\s\S]*?\$\$/g, '');
  // Strip inline math delimiters, keep content
  s = s.replace(/\$(.*?)\$/gs, (_, inner) => inner);
  // \not\in → ∉ etc. (handle negation before generic pass)
  s = s.replace(/\\not\\in\b/g, '∉').replace(/\\not\\subset\b/g, '⊄').replace(/\\not\\subseteq\b/g, '⊄');
  // \mathbb{X} → blackboard bold
  const BB: Record<string, string> = { R: 'ℝ', Z: 'ℤ', N: 'ℕ', Q: 'ℚ', C: 'ℂ', F: '𝔽', P: 'ℙ', E: '𝔼' };
  s = s.replace(/\\mathbb\{([A-Z])\}/g, (_, c) => BB[c] ?? c);
  // Math font wrappers — strip command, keep content
  s = s.replace(/\\math(?:cal|bf|rm|it|sf|tt|frak|scr)\{([^}]*)\}/g, '$1');
  s = s.replace(/\\(?:text|operatorname|textbf|textit|textrm)\{([^}]*)\}/g, '$1');
  // Accent/decoration commands — strip command, keep content
  s = s.replace(/\\(?:overline|underline|hat|tilde|bar|dot|ddot|vec|widehat|widetilde)\{([^}]*)\}/g, '$1');
  // \frac{a}{b} → a/b
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2');
  // \sqrt{x} → √x
  s = s.replace(/\\sqrt\{([^}]*)\}/g, '√$1');
  // Known commands → Unicode; unknown → removed
  s = s.replace(/\\([a-zA-Z]+)/g, (_, cmd) => LATEX_CMD_MAP[cmd] ?? '');
  // Subscripts: single digit/letter → Unicode sub, multi-char → _content
  s = s.replace(/_{(\d)}/g, (_, d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);
  s = s.replace(/_(\d)/g,   (_, d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);
  s = s.replace(/_{([^}]*)}/g, '_$1');
  // Superscripts: single digit → Unicode sup, multi-char → ^content
  s = s.replace(/\^{(\d)}/g, (_, d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  s = s.replace(/\^(\d)/g,   (_, d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  s = s.replace(/\^{([^}]*)}/g, '^$1');
  // Strip remaining backslash sequences and bare braces
  s = s.replace(/\\./g, '').replace(/[{}]/g, '');
  // Normalise whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Create a PDFString that survives non-ASCII characters by encoding as UTF-16BE
// with a BOM. copyStringIntoBuffer writes charCodeAt() per char, so a JS string
// whose char codes are the UTF-16BE byte sequence produces the correct PDF bytes.
function unicodePdfString(text: string): PDFString {
  if (!/[^\x20-\x7e]/.test(text)) return PDFString.of(text);
  const bytes: number[] = [0xFE, 0xFF]; // UTF-16BE BOM
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    if (cp < 0x10000) {
      bytes.push(cp >> 8, cp & 0xFF);
      i += 1;
    } else {
      const hi = Math.floor((cp - 0x10000) / 0x400) + 0xD800;
      const lo = ((cp - 0x10000) % 0x400) + 0xDC00;
      bytes.push(hi >> 8, hi & 0xFF, lo >> 8, lo & 0xFF);
      i += 2;
    }
  }
  return PDFString.of(String.fromCharCode(...bytes));
}

// Replace characters Helvetica (Windows-1252) cannot render cleanly.
// NFKD normalization maps mathematical Unicode variants to ASCII base letters
// before the non-ASCII strip (e.g. 𝒫→P, 𝒩𝒫→NP, ℝ→R).
function sanitizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(//g, '–')    // Chrome PDF misencodes en-dash as 0x13
    .replace(/[–—]/g, '-') // en/em dash
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    ; // Non-ASCII preserved — Liberation Sans covers Greek and common math symbols.
}

// Insert a Table of Contents before the first content page.
// Returns the number of TOC pages inserted (needed to offset page-number labels).
async function insertTableOfContents(
  doc: PDFDocument,
  chapterOutlines: Array<{ entries: OutlineEntry[]; pageOffset: number; chapterNum: string | null; bookPart: string | null }>,
): Promise<number> {
  interface TocItem {
    title: string;
    pageIndex: number;  // 0-based in merged doc *before* TOC insertion
    level: 0 | 1 | 2;
    pageRef: PDFRef;    // object ref — stays valid after page insertion
    pageLabel?: string; // overrides the computed Arabic page label
    isSeparator?: boolean;
  }

  const docPages = doc.getPages();
  const items: TocItem[] = [];

  const ROMAN_NUMERALS = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  let partCount = 0;
  let seenNumericChapter = false;
  let appendixSeparatorInserted = false;

  for (const { entries, pageOffset, chapterNum, bookPart } of chapterOutlines) {
    if (entries.length === 0) continue;

    const isNumeric = chapterNum !== null && /^\d+$/.test(chapterNum);
    const isAppendix = chapterNum !== null && /^[A-Z]$/.test(chapterNum);
    if (!isAppendix && bookPart !== null) {
      partCount++;
      const roman = ROMAN_NUMERALS[partCount - 1] ?? String(partCount);
      items.push({ title: `Part ${roman}: ${bookPart}`, pageIndex: 0, level: 0, pageRef: null as unknown as PDFRef, isSeparator: true });
    }
    if (isNumeric) seenNumericChapter = true;
    if (isAppendix && seenNumericChapter && !appendixSeparatorInserted) {
      items.push({ title: 'Appendices', pageIndex: 0, level: 0, pageRef: null as unknown as PDFRef, isSeparator: true });
      appendixSeparatorInserted = true;
    }

    const top = entries[0];
    const chPageIdx = top.pageIndex + pageOffset;
    const chTitle = chapterNum
      ? `${chapterNum}  ${sanitizeText(top.title)}`
      : sanitizeText(top.title);
    items.push({ title: chTitle, pageIndex: chPageIdx, level: 0, pageRef: docPages[chPageIdx].ref });

    // Suppress subsections for notation-like chapters in the backmatter (non-numeric chapter numbers)
    const isNotationChapter = !isNumeric && /^notation\b/i.test(top.title.trim());
    if (isNotationChapter) continue;

    top.children.forEach((sec, si) => {
      const secNum = chapterNum ? `${chapterNum}.${si + 1}` : null;
      const secTitle = secNum ? `${secNum}  ${sanitizeText(sec.title)}` : sanitizeText(sec.title);
      const secIdx = sec.pageIndex + pageOffset;
      items.push({ title: secTitle, pageIndex: secIdx, level: 1, pageRef: docPages[secIdx].ref });

      if (!/^notation\b/i.test(sec.title.trim())) {
        sec.children.forEach((sub, ssi) => {
          const subNum = secNum ? `${secNum}.${ssi + 1}` : null;
          const subTitle = subNum ? `${subNum}  ${sanitizeText(sub.title)}` : sanitizeText(sub.title);
          const subIdx = sub.pageIndex + pageOffset;
          items.push({ title: subTitle, pageIndex: subIdx, level: 2, pageRef: docPages[subIdx].ref });
        });
      }
    });
  }

  // Page geometry (matches A4 + print.css margins)
  const PW = 595.92, PH = 841.92;
  const ML = 72, MR = 72;       // left / right margin
  const TOP_Y = 740;             // baseline of "Contents" heading
  const FIRST_Y = TOP_Y - 32;   // first entry y, after heading
  const CONT_Y = TOP_Y;          // entry start y on continuation pages
  const BOT_Y = 65;              // lower content boundary

  // Per-level typography
  const CFG = [
    { fontSize: 11, lineH: 20, indent: 0,  bold: true },   // chapter
    { fontSize: 10, lineH: 15, indent: 20, bold: false },  // section
    { fontSize: 10, lineH: 14, indent: 40, bold: false },  // subsection
  ] as const;
  const CH_GAP = 8;       // extra vertical gap before each chapter entry
  const SEP_EXTRA_GAP = 8; // additional gap above the "Appendices" separator label

  // Dry-run layout to determine page count (needed before drawing, to calculate
  // the final "content page number" = pageIndex + tocPageCount + 1).
  function countTocPages(): number {
    let y = FIRST_Y, pages = 1;
    items.forEach((item, idx) => {
      if (item.isSeparator) {
        if (idx > 0) y -= CH_GAP;
        y -= SEP_EXTRA_GAP + CFG[0].lineH;
        if (y < BOT_Y) { pages++; y = CONT_Y - (SEP_EXTRA_GAP + CFG[0].lineH); }
        return;
      }
      if (item.level === 0 && idx > 0) y -= CH_GAP;
      y -= CFG[item.level].lineH;
      if (y < BOT_Y) { pages++; y = CONT_Y - CFG[item.level].lineH; }
    });
    return pages;
  }

  const tocPageCount = countTocPages();

  // Insert blank pages at the front of the document
  for (let i = 0; i < tocPageCount; i++) doc.insertPage(i, [PW, PH]);

  // Prepend a "Contents" bookmark to the outline built by buildOutline
  const tocPage0Ref = doc.getPage(0).ref;
  const bCtx = doc.context;
  const outlinesRawRef = doc.catalog.get(PDFName.of('Outlines'));
  const outlinesObj = resolveRef(bCtx, outlinesRawRef);
  if (outlinesObj instanceof PDFDict && outlinesRawRef instanceof PDFRef) {
    const contentsBookmarkRef = bCtx.nextRef();
    const oldFirst = outlinesObj.get(PDFName.of('First'));
    const dict: Record<string, unknown> = {
      Title: PDFString.of('Contents'),
      Parent: outlinesRawRef,
      Dest: bCtx.obj([tocPage0Ref, PDFName.of('XYZ'), null, null, null] as any),
      Count: PDFNumber.of(0),
    };
    if (oldFirst) dict.Next = oldFirst;
    bCtx.assign(contentsBookmarkRef, bCtx.obj(dict as any));
    if (oldFirst) {
      const oldFirstDict = resolveRef(bCtx, oldFirst);
      if (oldFirstDict instanceof PDFDict) oldFirstDict.set(PDFName.of('Prev'), contentsBookmarkRef);
    }
    outlinesObj.set(PDFName.of('First'), contentsBookmarkRef);
    if (!oldFirst) outlinesObj.set(PDFName.of('Last'), contentsBookmarkRef);
    const prevCount = (outlinesObj.get(PDFName.of('Count')) as any)?.asNumber?.() ?? 0;
    outlinesObj.set(PDFName.of('Count'), PDFNumber.of(prevCount + 1));
  }

  // Embed Liberation Sans (metrically identical to Helvetica, but with Unicode coverage for Greek etc.)
  // Falls back to built-in Helvetica if the TTF files are unavailable.
  doc.registerFontkit(fontkit);
  const fontsDir = join(homedir(), '.local/share/fonts');
  let boldFont: Awaited<ReturnType<typeof doc.embedFont>>;
  let regFont:  Awaited<ReturnType<typeof doc.embedFont>>;
  try {
    const [boldBytes, regBytes] = await Promise.all([
      readFile(join(fontsDir, 'LiberationSans-Bold.ttf')),
      readFile(join(fontsDir, 'LiberationSans-Regular.ttf')),
    ]);
    [boldFont, regFont] = await Promise.all([
      doc.embedFont(boldBytes, { subset: true }),
      doc.embedFont(regBytes,  { subset: true }),
    ]);
  } catch {
    boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    regFont  = await doc.embedFont(StandardFonts.Helvetica);
  }

  let tocPgIdx = 0;
  let pg = doc.getPage(tocPgIdx);
  let y = TOP_Y;

  // "Contents" heading
  pg.drawText('Contents', { x: ML, y, size: 20, font: boldFont, color: rgb(0, 0, 0) });
  y = FIRST_Y;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];

    if (item.isSeparator) {
      if (idx > 0) y -= CH_GAP;
      if (y - SEP_EXTRA_GAP - CFG[0].lineH < BOT_Y) {
        tocPgIdx++;
        pg = doc.getPage(tocPgIdx);
        y = CONT_Y;
      }
      y -= SEP_EXTRA_GAP + CFG[0].lineH;
      pg.drawText(item.title, { x: ML, y, size: CFG[0].fontSize, font: boldFont, color: rgb(0.5, 0.5, 0.5) });
      continue;
    }

    const cfg = CFG[item.level];
    const font = cfg.bold ? boldFont : regFont;

    if (item.level === 0 && idx > 0) y -= CH_GAP;

    if (y - cfg.lineH < BOT_Y) {
      tocPgIdx++;
      pg = doc.getPage(tocPgIdx);
      y = CONT_Y;
    }
    y -= cfg.lineH;

    const x = ML + cfg.indent;
    const rightX = PW - MR;

    // Page number label: content pages are numbered starting at tocPageCount+1
    const pgLabel = item.pageLabel ?? String(item.pageIndex + tocPageCount + 1);
    const pgLabelW = font.widthOfTextAtSize(pgLabel, cfg.fontSize);
    const pgLabelX = rightX - pgLabelW;

    // Dot leaders
    const titleW = font.widthOfTextAtSize(item.title, cfg.fontSize);
    const dotW   = font.widthOfTextAtSize('.', cfg.fontSize);
    const gapW   = pgLabelX - 4 - (x + titleW + 4);
    const numDots = Math.max(0, Math.floor(gapW / dotW));

    pg.drawText(item.title, { x, y, size: cfg.fontSize, font, color: rgb(0, 0, 0) });
    if (numDots > 0) {
      pg.drawText('.'.repeat(numDots), {
        x: x + titleW + 4, y,
        size: cfg.fontSize, font, color: rgb(0.55, 0.55, 0.55),
      });
    }
    pg.drawText(pgLabel, { x: pgLabelX, y, size: cfg.fontSize, font, color: rgb(0, 0, 0) });

    // Clickable link annotation covering the full line width
    const annotRef = doc.context.nextRef();
    doc.context.assign(annotRef, doc.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Link'),
      Rect: doc.context.obj([x, y - 2, rightX, y + cfg.fontSize + 2]),
      Border: doc.context.obj([0, 0, 0]),
      Dest: doc.context.obj([item.pageRef, PDFName.of('XYZ'), null, null, null]),
    }));
    const annotsKey = PDFName.of('Annots');
    const existing = pg.node.get(annotsKey);
    if (existing instanceof PDFArray) {
      (existing as PDFArray).push(annotRef);
    } else {
      pg.node.set(annotsKey, doc.context.obj([annotRef]));
    }
  }

  return tocPageCount;
}

function toRoman(n: number): string {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['m','cm','d','cd','c','xc','l','xl','x','ix','v','iv','i'];
  let out = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { out += syms[i]; n -= vals[i]; }
  }
  return out;
}

// TOC pages get lowercase Roman numerals (i, ii, …).
// Content pages get Arabic numerals (1 / N, 2 / N, …).
// PageLabels is also set in the catalog so PDF viewer nav bars agree.
async function addPageNumbers(doc: PDFDocument, tocPageCount = 0) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 10;
  const color = rgb(0.4, 0.4, 0.4);
  const pages = doc.getPages();
  const contentTotal = pages.length - tocPageCount;

  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const text = i < tocPageCount
      ? toRoman(i + 1)
      : `${i - tocPageCount + 1} / ${contentTotal}`;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: 35,  // sits in the 3cm bottom margin (≈85 pts)
      size: fontSize,
      font,
      color,
    });
  });

  // Set PageLabels so viewer nav bars show the same scheme.
  // /r = lowercase Roman, /D = decimal Arabic.
  const ctx = doc.context;
  const labelsRef = ctx.nextRef();
  const numsArray: unknown[] = [
    PDFNumber.of(0), ctx.obj({ S: PDFName.of('r') }),           // TOC: i, ii, …
    PDFNumber.of(tocPageCount), ctx.obj({ S: PDFName.of('D') }), // content: 1, 2, …
  ];
  ctx.assign(labelsRef, ctx.obj({ Nums: ctx.obj(numsArray) }));
  doc.catalog.set(PDFName.of('PageLabels'), labelsRef);
}

// ─── heading text extraction ──────────────────────────────────────────────

async function loadRegistry(root: string): Promise<Record<string, any>> {
  const src = await readFile(join(root, '.astro/registry.json'), 'utf8').catch(() => '{}');
  try { return JSON.parse(src); } catch { return {}; }
}

function refLabel(entry: any, altLabel?: string): string {
  if (altLabel) return altLabel;
  const { kind, type, number, label } = entry;
  const isEquation = kind === 'equation' || (kind == null && type === 'Equation');
  const isSection  = kind === 'section'  || (kind == null && type === 'Section');
  const isChapter  = kind === 'chapter';
  if (isEquation) return `(${label ?? number})`;
  if (isSection)  return `§${number}`;
  if (isChapter)  return label ?? (typeof number === 'string' ? `Appendix ${number}` : `Chapter ${number}`);
  return label ?? `${type} ${number}`;
}

// Read katex-macros.ts and return a map of { '\cmd': 'expansion' }.
// The file uses JS string literals so `\\P` on disk = the command \P.
async function loadKatexMacros(root: string): Promise<Record<string, string>> {
  const src = await readFile(join(root, 'katex-macros.ts'), 'utf8').catch(() => '');
  const macros: Record<string, string> = {};
  const re = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const key = m[1].replace(/\\\\/g, '\\');
    const val = m[2].replace(/\\\\/g, '\\');
    if (key.startsWith('\\')) macros[key] = val;
  }
  return macros;
}

// Expand KaTeX macros (no-arg and single-arg) in a string.
// Processes longest commands first to avoid prefix collisions (\NP before \P).
function expandMacros(text: string, macros: Record<string, string>): string {
  let s = text;
  const sorted = Object.entries(macros).sort((a, b) => b[0].length - a[0].length);
  for (const [cmd, expansion] of sorted) {
    const name = cmd.slice(1);
    if (expansion.includes('#1')) {
      s = s.replace(new RegExp(`\\\\${name}\\{([^}]*)\\}`, 'g'),
        (_, arg) => expansion.replace(/#1/g, arg));
    } else {
      s = s.replace(new RegExp(`\\\\${name}(?![a-zA-Z])`, 'g'), expansion);
    }
  }
  return s;
}

// Parse heading texts from an MDX source file in document order.
// Expands macros and converts LaTeX to Unicode so the results are suitable
// for both PDF bookmarks (unicodePdfString) and the TOC page (sanitizeText).
async function mdxHeadingTexts(
  filePath: string,
  macros: Record<string, string>,
  registry: Record<string, any>,
): Promise<string[]> {
  const src = await readFile(filePath, 'utf8').catch(() => '');
  const body = src.replace(/^---[\s\S]*?\n---\n?/, '');
  const texts: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+)/);
    if (!m) continue;
    let text = m[1]
      .replace(/\{\/\*.*?\*\/\}/g, '')  // strip {/* sec:id */} anchors
      .replace(/<Ref\s+[^>]*\/>/g, (tag) => {
        const idM  = tag.match(/\bid=["']([^"']+)["']/);
        const altM = tag.match(/\baltLabel=["']([^"']+)["']/);
        const entry = idM ? registry[idM[1]] : null;
        return entry ? refLabel(entry, altM?.[1]) : '';
      })
      .trim();
    text = expandMacros(text, macros);
    text = latexToUnicode(text);
    texts.push(text);
  }
  return texts;
}

// Overwrite outline entry titles with parsed MDX heading texts in depth-first
// (document) order, which matches the order Chrome uses when building its outline.
function patchEntryTitles(entries: OutlineEntry[], texts: string[], idx = { n: 0 }): void {
  for (const entry of entries) {
    if (idx.n < texts.length) entry.title = texts[idx.n++];
    patchEntryTitles(entry.children, texts, idx);
  }
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await Promise.all([mkdir(CHAPTERS_OUT, { recursive: true }), ensureFonts()]);

  const [bookTitle, chapters] = await Promise.all([
    readBookTitle(ROOT),
    collectChapters(join(ROOT, 'content')),
  ]);
  const [macros, registry] = await Promise.all([
    loadKatexMacros(ROOT),
    loadRegistry(ROOT),
  ]);

  console.log('Starting preview server…');
  const { process: server, base: BASE } = await startPreviewServer();

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--run-all-compositor-stages-before-draw',
    ],
  });

  try {
    console.log(`Printing ${chapters.length} chapter(s)…\n`);

    const generated: Array<{ slug: string; title: string; pdfPath: string; chapterNum: string | null; bookPart: string | null }> = [];

    for (const { slug, title, chapterNum, bookPart } of chapters) {
      const url = `${BASE}/${slug.toLowerCase()}`;
      const outFile = join(CHAPTERS_OUT, `${slug.replace(/\//g, '_')}.pdf`);
      console.log(`  ${url} → ${outFile}`);
      try {
        // Pass 1: load in screen mode so the browser HTTP-caches the web fonts
        // (KaTeX + Source Serif 4). Chrome skips web font requests when
        // emulateMediaType('print') is set before navigation, producing PDFs
        // with invisible text. Warming the cache first fixes that.
        const warmPage = await browser.newPage();
        warmPage.setDefaultNavigationTimeout(60_000);
        await warmPage.goto(url, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 3_000));
        await warmPage.close();

        // Pass 2: load in print mode with fonts served from HTTP cache.
        // The sticky sidebars are display:none under @media print so they are
        // never in the layout, which prevents page.pdf() from crashing on them.
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(60_000);
        page.setDefaultTimeout(60_000);
        await page.emulateMediaType('print');
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1_000));
        await page.pdf({ path: outFile, format: 'A4', printBackground: true, outline: true });
        await page.close();
        console.log(`  ✓ saved`);
        generated.push({ slug, title, pdfPath: outFile, chapterNum, bookPart });
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }

    if (generated.length > 1) {
      const filename = `${bookTitle.replace(/[/\\:*?"<>|]/g, '-')}.pdf`;
      const combinedPath = join(OUT, filename);
      console.log(`\nMerging into ${combinedPath}…`);

      const merged = await PDFDocument.create();
      merged.setTitle(bookTitle);

      const chapterOutlines: Array<{ entries: OutlineEntry[]; pageOffset: number; chapterNum: string | null; bookPart: string | null }> = [];
      const slugMap = new Map<string, { pageOffset: number; anchors: Map<string, AnchorDest> }>();

      for (const ch of generated) {
        const bytes = await readFile(ch.pdfPath);
        const doc = await PDFDocument.load(bytes);
        const ctx = doc.context;
        const srcPages = doc.getPages();
        const pageOffset = merged.getPageCount();

        // Extract outline before copying (page refs belong to this doc's context)
        const entries = extractOutlineFromDoc(doc);
        // Chrome can't extract text from aria-hidden KaTeX spans, so replace
        // the titles with heading text parsed directly from the MDX source.
        // The chapter H1 comes from frontmatter (rendered by the layout), so
        // prepend it manually — it won't appear as a # heading in the MDX body.
        const mdxTexts = await mdxHeadingTexts(join(ROOT, 'content', `${ch.slug}.mdx`), macros, registry);
        const h1 = latexToUnicode(expandMacros(ch.title, macros));
        patchEntryTitles(entries, [h1, ...mdxTexts]);
        chapterOutlines.push({ entries, pageOffset, chapterNum: ch.chapterNum, bookPart: ch.bookPart });

        const copied = await merged.copyPages(doc, doc.getPageIndices());
        copied.forEach(pg => merged.addPage(pg));

        // Map source page refs → merged page refs (needed to remap anchor dests)
        const srcToMerged = new Map<string, PDFRef>(
          srcPages.map((sp, i) => [sp.ref.toString(), copied[i].ref])
        );

        // Extract named destinations from the source chapter PDF and remap to merged refs
        const anchors = new Map<string, AnchorDest>();
        const destsObj = resolveRef(ctx, doc.catalog.get(PDFName.of('Dests')));
        if (destsObj instanceof PDFDict) {
          for (const key of destsObj.keys()) {
            const name = key.encodedName.slice(1);
            if (!name) continue;
            const arr = resolveRef(ctx, destsObj.get(key));
            if (!(arr instanceof PDFArray)) continue;
            const mergedPageRef = srcToMerged.get(arr.get(0)?.toString() ?? '');
            if (!mergedPageRef) continue;
            const isXYZ = arr.get(1)?.toString() === '/XYZ';
            anchors.set(name, {
              pageRef: mergedPageRef,
              x: isXYZ ? (arr.get(2) as any)?.asNumber?.() ?? null : null,
              y: isXYZ ? (arr.get(3) as any)?.asNumber?.() ?? null : null,
            });
          }
        }

        // Remap within-chapter named-dest annotations in the just-copied pages.
        // Chrome encodes within-chapter links as PDFName named destinations
        // (e.g. /def:convergence). copyPages preserves them verbatim but the
        // merged PDF has no /Dests catalog, so they would fail. Convert each
        // to a direct [pageRef /XYZ x y null] array using the anchors map.
        const mergedCtx = merged.context;
        for (const copiedPage of copied) {
          const annotsRaw = copiedPage.node.get(PDFName.of('Annots'));
          const annots = resolveRef(mergedCtx, annotsRaw);
          if (!(annots instanceof PDFArray)) continue;
          for (let ai = 0; ai < annots.size(); ai++) {
            const ann = resolveRef(mergedCtx, annots.get(ai));
            if (!(ann instanceof PDFDict)) continue;
            const destRaw = ann.get(PDFName.of('Dest'));
            if (!destRaw) continue;
            let anchorName: string | null = null;
            if (destRaw instanceof PDFName) {
              anchorName = destRaw.encodedName.slice(1); // strip leading /
            } else if (typeof (destRaw as any).decodeText === 'function') {
              anchorName = (destRaw as any).decodeText();
            }
            if (!anchorName) continue;
            const dest = anchors.get(anchorName);
            if (!dest) continue;
            ann.set(PDFName.of('Dest'), mergedCtx.obj([dest.pageRef, PDFName.of('XYZ'), dest.x, dest.y, null]));
          }
        }

        slugMap.set(ch.slug.toLowerCase(), { pageOffset, anchors });
      }

      fixLinks(merged, slugMap);
      buildOutline(merged, chapterOutlines);
      const tocPageCount = await insertTableOfContents(merged, chapterOutlines);
      await addPageNumbers(merged, tocPageCount);
      await writeFile(combinedPath, await merged.save());
      console.log(`  ✓ saved`);

      // Now that merging is done, strip cross-chapter localhost URIs from the
      // individual chapter PDFs. The merge step needed the originals; the
      // standalone files shouldn't try to open a browser for cross-chapter links.
      console.log('\nStripping external links from individual chapter PDFs…');
      for (const ch of generated) {
        const chDoc = await PDFDocument.load(await readFile(ch.pdfPath));
        stripExternalLocalhostLinks(chDoc);
        await writeFile(ch.pdfPath, await chDoc.save());
      }
    }

    console.log(`\nDone. Combined PDF → pdfs/  |  Chapter PDFs → pdfs/chapters/`);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
