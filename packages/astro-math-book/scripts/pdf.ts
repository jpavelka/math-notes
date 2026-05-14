import puppeteer from 'puppeteer';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { readdir, mkdir, symlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const ROOT = process.cwd();  // always the project root when invoked via `npm run`
const PREFERRED_PORT = 4322;
const OUT = join(ROOT, 'pdfs');

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

    // Fallback if the ready line never appears
    setTimeout(() => { if (!settled) reject(new Error('Preview server did not print a ready URL')); }, 30_000);
  });
}

async function collectSlugs(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const slugs: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      slugs.push(...await collectSlugs(join(dir, e.name), `${prefix}${e.name}/`));
    } else if (e.name.endsWith('.mdx')) {
      slugs.push(`${prefix}${e.name.slice(0, -4)}`);
    }
  }
  return slugs.sort();
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

async function main() {
  await Promise.all([mkdir(OUT, { recursive: true }), ensureFonts()]);

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
    const slugs = await collectSlugs(join(ROOT, 'content'));
    console.log(`Printing ${slugs.length} chapter(s)…\n`);

    for (const slug of slugs) {
      const url = `${BASE}/${slug.toLowerCase()}`;
      const outFile = join(OUT, `${slug.replace(/\//g, '_')}.pdf`);
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
        await page.pdf({ path: outFile, format: 'A4', printBackground: true });
        await page.close();
        console.log(`  ✓ saved`);
      } catch (err) {
        console.error(`  ✗ ${err}`);
      }
    }

    console.log(`\nDone. PDFs saved to pdfs/`);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
