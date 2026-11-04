#!/usr/bin/env node
// CS2 Esports Center arayüz kalite kontrolü.
// Siteyi 4 ekran genişliğinde ve 2 temada açar; listeleri, turnuvaları ve farklı durumdaki maç
// detaylarını gezer, qa/checks.js kontrollerini çalıştırır, ekran görüntüsü alır ve
// qa/out/report.md yazar. "error" seviyesinde sorun varsa çıkış kodu 1 olur.
//
//   node qa/run.mjs                       site/ klasörünü yerel sunucuda test eder
//   node qa/run.mjs --live-data           yerel kodu, yayındaki gerçek veriyle test eder
//   node qa/run.mjs --url https://…/      yayındaki siteyi test eder
//   node qa/run.mjs --quick               yalnızca mobil ve masaüstü, koyu tema
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { runChecks } from './checks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const OUT = join(ROOT, 'qa', 'out');
const LIVE = 'https://lxaedith.github.io/cs2-esports-center/';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const quick = flag('--quick');

const VIEWPORTS = [
  { name: 'mobil', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'masaustu', width: 1920, height: 1080 },
].filter(v => !quick || ['mobil', 'masaustu'].includes(v.name));
const THEMES = quick ? ['dark'] : ['dark', 'light'];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

// site/ klasörünü sunar; --live-data ile /data/ istekleri yayındaki dosyalardan karşılanır.
async function serve(liveData) {
  const cache = new Map();
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try {
      let body;
      if (liveData && path.startsWith('/data/')) {
        if (!cache.has(path)) cache.set(path, Buffer.from(await (await fetch(new URL(path.slice(1), LIVE))).arrayBuffer()));
        body = cache.get(path);
      } else {
        const file = normalize(join(SITE, path.endsWith('/') ? `${path}index.html` : path));
        if (!file.startsWith(SITE)) throw new Error('forbidden');
        body = await readFile(file);
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'text/html; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

// Veriden test edilecek sayfaları seç: her liste, iki tür turnuva ve her durumda bir maç detayı.
function routesFrom(data) {
  const routes = [
    ['canli', '#/canli'], ['yaklasan', '#/yaklasan'], ['sonuclar', '#/sonuclar'], ['turnuvalar', '#/turnuvalar'],
  ];
  const full = m => m.teams?.length === 2;
  const live = data.running.find(full);
  const next = data.upcoming.find(full);
  const done = data.past.find(full);
  const bracket = data.tournaments.find(t => t.standings?.length && t.standings[0].wins == null);
  const group = data.tournaments.find(t => t.standings?.length && t.standings[0].wins != null);
  if (live) routes.push(['mac-canli', `#/mac/${live.id}`]);
  if (next) routes.push(['mac-yaklasan', `#/mac/${next.id}`]);
  if (done) routes.push(['mac-bitti', `#/mac/${done.id}`]);
  if (bracket) routes.push(['turnuva-eleme', `#/turnuvalar/all/${bracket.id}`]);
  if (group) routes.push(['turnuva-grup', `#/turnuvalar/all/${group.id}`]);
  return routes;
}

async function main() {
  const external = option('--url');
  const local = external ? null : await serve(flag('--live-data'));
  const base = external ?? local.base;
  const data = await (await fetch(new URL('data/cs2.json', base))).json();
  const routes = routesFrom(data);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'shots'), { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, colorScheme: theme });
      await context.addInitScript(t => { try { localStorage.setItem('theme', t); } catch {} }, theme);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', err => consoleErrors.push(err.message));

      for (const [name, hash] of routes) {
        consoleErrors.length = 0;
        await page.goto(new URL(hash, base).href, { waitUntil: 'networkidle' });
        // Maç detayı takım verisini sonradan yükler; bölümlerin gelmesini bekle.
        if (name.startsWith('mac-')) await page.waitForSelector('.block .cmp, .block .pad, .rosters', { timeout: 8000 }).catch(() => {});
        // Düzen kendi kendini büyütüyorsa (ör. ölç-yaz döngüsü) iki ölçüm arasında fark çıkar.
        const before = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.waitForTimeout(600);
        const after = await page.evaluate(() => document.documentElement.scrollHeight);
        const issues = await page.evaluate(runChecks);
        if (Math.abs(after - before) > 4) {
          issues.push({ check: 'kararsiz-duzen', severity: 'error', detail: `sayfa yüksekliği beklerken değişti (${before} → ${after}px)` });
        }
        for (const e of consoleErrors) issues.push({ check: 'konsol-hatasi', severity: 'error', detail: e.slice(0, 160) });
        const shot = `shots/${name}-${vp.name}-${theme}.png`;
        if (!flag('--no-shots')) await page.screenshot({ path: join(OUT, shot), fullPage: name.startsWith('mac-') });
        results.push({ route: name, hash, viewport: vp.name, width: vp.width, theme, shot, issues });
      }
      await context.close();
    }
  }
  await browser.close();
  local?.server.close();

  const errors = results.flatMap(r => r.issues.filter(i => i.severity === 'error').map(i => ({ ...i, ...r })));
  const warns = results.flatMap(r => r.issues.filter(i => i.severity === 'warn').map(i => ({ ...i, ...r })));
  await writeFile(join(OUT, 'report.json'), JSON.stringify({ base, results }, null, 2));
  await writeFile(join(OUT, 'report.md'), report(base, routes, results, errors, warns));

  console.log(`QA: ${results.length} sayfa görünümü, ${errors.length} hata, ${warns.length} uyarı → qa/out/report.md`);
  for (const line of summarize(errors).slice(0, 25)) console.log(`  ✗ ${line}`);
  for (const line of summarize(warns).slice(0, 10)) console.log(`  ! ${line}`);
  process.exitCode = errors.length ? 1 : 0;
}

// Aynı sorun birçok temada/genişlikte tekrarlanıyorsa tek satırda topla.
function summarize(list) {
  const groups = new Map();
  for (const i of list) {
    // Kontrast sayfaya değil temaya bağlı; her sayfada tekrar listelenmesin.
    const route = i.check === 'kontrast' ? 'tema' : i.route;
    const key = `${route} · ${i.check} · ${i.detail.replace(/\d+px/g, 'Npx').replace(/\d+\/\d+/g, 'N/N')}`;
    if (!groups.has(key)) groups.set(key, { i, route, where: new Set() });
    groups.get(key).where.add(`${i.viewport}/${i.theme}`);
  }
  return [...groups.values()].map(({ i, route, where }) => `${route} · ${i.check}: ${i.detail} [${[...where].join(', ')}]`);
}

function report(base, routes, results, errors, warns) {
  const cell = (route, vp, theme) => {
    const r = results.find(x => x.route === route && x.viewport === vp && x.theme === theme);
    if (!r) return '';
    const e = r.issues.filter(i => i.severity === 'error').length;
    const w = r.issues.filter(i => i.severity === 'warn').length;
    return e ? `✗ ${e}` : w ? `! ${w}` : '✓';
  };
  const cols = VIEWPORTS.flatMap(v => THEMES.map(t => [v.name, t]));
  return [
    '# Arayüz kalite raporu',
    '',
    `Adres: ${base} · ${new Date().toISOString()}`,
    '',
    `**${errors.length} hata, ${warns.length} uyarı** (${results.length} sayfa görünümü)`,
    '',
    `| Sayfa | ${cols.map(([v, t]) => `${v} ${t === 'dark' ? '🌙' : '☀️'}`).join(' | ')} |`,
    `| --- | ${cols.map(() => ':-:').join(' | ')} |`,
    ...routes.map(([name]) => `| ${name} | ${cols.map(([v, t]) => cell(name, v, t)).join(' | ')} |`),
    '',
    '## Hatalar',
    '',
    ...(summarize(errors).map(l => `- ${l}`) || []),
    errors.length ? '' : '_Yok._',
    '',
    '## Uyarılar',
    '',
    ...summarize(warns).map(l => `- ${l}`),
    warns.length ? '' : '_Yok._',
    '',
  ].join('\n');
}

await main();
