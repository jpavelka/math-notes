import { spawn, execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { readdir, mkdir } from 'fs/promises';
import { join } from 'path';

const ROOT = process.cwd();  // always the project root when invoked via `npm run`
const PORT = 4322;
const BASE = `http://localhost:${PORT}`;
const OUT = join(ROOT, 'pdfs');

async function waitForServer(ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE);
      if (r.status < 500) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Preview server did not become ready');
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

async function main() {
  await mkdir(OUT, { recursive: true });

  const server = spawn('node_modules/.bin/astro', ['preview', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.pipe(process.stdout);
  server.stderr?.pipe(process.stderr);

  try {
    console.log('Waiting for preview server…');
    await waitForServer();

    const slugs = await collectSlugs(join(ROOT, 'src/content/chapters'));
    console.log(`Printing ${slugs.length} chapter(s)…\n`);

    const chromePath = findChrome();
    console.log(`Chrome: ${chromePath}`);

    for (const slug of slugs) {
      const url = `${BASE}/chapters/${slug}`;
      const outFile = join(OUT, `${slug.replace(/\//g, '_')}.pdf`);
      console.log(`  ${url} → ${outFile}`);

      const result = spawnSync(chromePath, [
        '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--run-all-compositor-stages-before-draw',
        `--print-to-pdf=${outFile}`,
        '--print-to-pdf-no-header',
        url,
      ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, shell: true });

      // Always show relevant stderr lines (incl. "bytes written" confirmation)
      const relevantStderr = (result.stderr?.toString() ?? '')
        .split('\n')
        .filter(l => l.trim() && !l.includes('TextRunHarfBuzz') && !l.includes('dbus') &&
                     !l.includes('NameHasOwner') && !l.includes('platform_font') &&
                     (l.includes('written') || l.includes('PDF') || result.status !== 0))
        .join('\n');
      if (result.status !== 0) {
        console.error(`  ✗ exit ${result.status}${relevantStderr ? '\n' + relevantStderr : ''}`);
      } else if (existsSync(outFile)) {
        console.log(`  ✓ saved`);
      } else {
        console.error(`  ✗ chrome exited 0 but file not created. stderr:\n${result.stderr?.toString().split('\n').filter((l:string) => !l.includes('ERROR:') && l.trim()).join('\n')}`);
      }
    }

    console.log(`\nDone. PDFs saved to pdfs/`);
  } finally {
    server.kill();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
