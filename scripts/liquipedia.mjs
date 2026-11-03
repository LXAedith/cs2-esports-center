// Takım/oyuncu adlarını Liquipedia sayfalarıyla eşleştirir.
// Liquipedia MediaWiki API kuralları: istekler arası en az 2 sn, projeyi tanıtan bir User-Agent,
// gzip desteği ve sonuçların olabildiğince uzun önbelleğe alınması. https://liquipedia.net/api-terms-of-use
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// PandaScore oyun kısa adı → Liquipedia wiki adı
export const WIKIS = {
  'league-of-legends': 'leagueoflegends',
  'cs-go': 'counterstrike',
  'dota-2': 'dota2',
  'valorant': 'valorant',
  'ow': 'overwatch',
  'r6-siege': 'rainbowsix',
  'rl': 'rocketleague',
  'pubg': 'pubg',
  'cod-mw': 'callofduty',
  'fifa': 'easportsfc',
  'mlbb': 'mobilelegends',
  'lol-wild-rift': 'wildrift',
  'kog': 'honorofkings',
  'starcraft-2': 'starcraft2',
  'starcraft-brood-war': 'starcraft',
};

const DAY = 86_400_000;
const FOUND_TTL = 30 * DAY;
const MISSING_TTL = 3 * DAY;
const PRUNE_AFTER = 60 * DAY;
const BATCH = 50;
const GAP_MS = 2100;
// Yalnızca takım ve oyuncu sayfalarını kabul et; aynı adlı başka sayfalara bağlantı vermeyelim.
const CATEGORIES = 'Category:Teams|Category:Players';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (wiki, name) => `${wiki}|${name}`;
// MediaWiki başlıklarında geçersiz karakterler; ":" ad alanı sanılabileceği için o da atlanır.
const validTitle = name => name.length > 0 && name.length < 200 && !/[#<>[\]|{}:]/.test(name);

export const pageUrl = (wiki, title) =>
  `https://liquipedia.net/${wiki}/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/gi, '/')}`;

async function loadCache(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

async function query(wiki, names, userAgent) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'categories',
    cllimit: 'max',
    clcategories: CATEGORIES,
    titles: names.join('|'),
  });
  const res = await fetch(`https://liquipedia.net/${wiki}/api.php?${params}`, { headers: { 'User-Agent': userAgent } });
  if (!res.ok) {
    const err = new Error(`Liquipedia ${res.status} (${wiki})`);
    err.status = res.status;
    throw err;
  }
  const q = (await res.json()).query ?? {};
  const normalized = new Map((q.normalized ?? []).map(n => [n.from, n.to]));
  const redirects = new Map((q.redirects ?? []).map(r => [r.from, r.to]));
  const pages = new Set((q.pages ?? []).filter(p => !p.missing && !p.invalid && p.categories?.length).map(p => p.title));
  const found = new Map();
  for (const name of names) {
    let title = normalized.get(name) ?? name;
    title = redirects.get(title) ?? title;
    if (pages.has(title)) found.set(name, title);
  }
  return found;
}

/**
 * entries: [{ wiki, name }]. Önbellekte olmayan veya süresi dolan adları toplu sorgular,
 * en fazla `maxRequests` istek atar; kalanlar sonraki çalıştırmaya kalır.
 * Dönen `lookup(wiki, name)` sayfa URL'si ya da null verir.
 */
export async function resolveLiquipedia(entries, { cacheFile, userAgent, maxRequests = 20 }) {
  const cache = await loadCache(cacheFile);
  const now = Date.now();

  const pending = new Map();
  for (const { wiki, name } of entries) {
    const hit = cache[key(wiki, name)];
    if (hit && now - hit.t < (hit.p ? FOUND_TTL : MISSING_TTL)) continue;
    if (!validTitle(name)) continue;
    if (!pending.has(wiki)) pending.set(wiki, new Set());
    pending.get(wiki).add(name);
  }

  let requests = 0;
  let left = 0;
  let blocked = false;
  for (const [wiki, set] of pending) {
    const names = [...set];
    for (let i = 0; i < names.length; i += BATCH) {
      const batch = names.slice(i, i + BATCH);
      if (blocked || requests >= maxRequests) {
        left += batch.length;
        continue;
      }
      if (requests) await sleep(GAP_MS);
      requests++;
      try {
        const found = await query(wiki, batch, userAgent);
        for (const name of batch) cache[key(wiki, name)] = { p: found.get(name) ?? null, t: now };
      } catch (err) {
        console.warn(err.message);
        left += batch.length;
        // Hız sınırı veya engel: bu çalıştırmada Liquipedia'ya bir daha gitme.
        if (err.status === 403 || err.status === 429) blocked = true;
      }
    }
  }

  for (const [k, v] of Object.entries(cache)) {
    if (now - v.t > PRUNE_AFTER) delete cache[k];
  }
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache));

  return {
    requests,
    left,
    lookup(wiki, name) {
      const page = cache[key(wiki, name)]?.p;
      return page ? pageUrl(wiki, page) : null;
    },
  };
}
