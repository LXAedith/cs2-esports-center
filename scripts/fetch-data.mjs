#!/usr/bin/env node
// PandaScore'dan CS2 maçlarını, turnuvaları, puan durumlarını ve kadroları çekip iki dosya yazar:
//   site/data/cs2.json    listeler (canlı, yaklaşan, son sonuçlar, turnuvalar)
//   site/data/teams.json  maç detayı için takımlar, kadrolar, form ve aralarındaki maçlar
// PANDASCORE_TOKEN yoksa (veya --demo verilirse) önizleme için demo veri üretir.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoData } from './demo-data.mjs';
import { resolveLiquipedia } from './liquipedia.mjs';
import { headToHead, indexByTeam, mergeMeetings, pairKey, teamSummary, toMeeting, tournamentRecords } from './stats.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'site', 'data');
const CACHE_DIR = join(ROOT, 'cache');

const API = 'https://api.pandascore.co';
const GAME = 'cs-go'; // PandaScore CS2'yi de bu kısa adla tutuyor
const WIKI = 'counterstrike';
const TOKEN = process.env.PANDASCORE_TOKEN?.trim();
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD ?? 7);
const DAYS_BACK = Number(process.env.DAYS_BACK ?? 7);
const DAYS_HISTORY = Number(process.env.DAYS_HISTORY ?? 30);
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 6);
const MAX_HISTORY_PAGES = Number(process.env.MAX_HISTORY_PAGES ?? 25);
const MAX_STANDINGS = Number(process.env.MAX_STANDINGS ?? 30);
const MAX_ROSTER_REQUESTS = Number(process.env.MAX_ROSTER_REQUESTS ?? 10);
const MAX_H2H_REQUESTS = Number(process.env.MAX_H2H_REQUESTS ?? 60);
const LIQUIPEDIA = process.env.LIQUIPEDIA !== '0';
const LIQUIPEDIA_MAX_REQUESTS = Number(process.env.LIQUIPEDIA_MAX_REQUESTS ?? 20);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ROSTER_TTL = 12 * HOUR;
const H2H_TTL = 7 * DAY;
const TIER_ORDER = { s: 0, a: 1, b: 2, c: 3, d: 4, unranked: 5 };
const tierRank = m => TIER_ORDER[m.tournament?.tier] ?? 9;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const time = m => Date.parse(m.begin_at ?? m.scheduled_at ?? '') || 0;
const isoSec = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

// PandaScore saatlik kotanın yanında kısa süreli patlamaları da sınırlıyor (429); istekler aralıklı gider.
const MIN_GAP_MS = 400;
let lastRequest = 0;

async function api(path, params = {}) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
    if (res.ok) return { data: await res.json(), total: Number(res.headers.get('x-total') ?? 0) };
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep((res.status === 429 ? 6000 : 2000) * attempt);
      continue;
    }
    throw new Error(`PandaScore ${res.status} ${url.pathname}: ${(await res.text()).slice(0, 300)}`);
  }
}

// Sayfa sayfa çeker; `stop` son öğeye bakıp daha fazla sayfaya gerek olmadığını söyleyebilir.
async function pages(path, params, stop = () => false, maxPages = MAX_PAGES) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, total } = await api(path, { ...params, per_page: 100, page });
    out.push(...data);
    if (data.length < 100 || (total && out.length >= total) || stop(data.at(-1))) break;
  }
  return out;
}

function slimTeam(t) {
  return {
    id: t.id,
    name: t.name,
    acronym: t.acronym ?? null,
    image: t.image_url ?? null,
    image_dark: t.dark_mode_image_url ?? null,
  };
}

function slimPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    nationality: p.nationality ?? null,
    role: p.role ?? null,
    image: p.image_url ?? null,
  };
}

function slimMatch(m) {
  const scores = new Map((m.results ?? []).map(r => [r.team_id ?? r.player_id, r.score]));
  // "Grand final: A vs B" → "Grand final"
  const stage = m.name?.includes(':') ? m.name.split(':')[0].trim() : null;
  return {
    id: m.id,
    stage,
    status: m.status,
    begin_at: m.begin_at ?? m.scheduled_at,
    end_at: m.end_at,
    bo: m.number_of_games,
    type: m.match_type,
    league: m.league && { id: m.league.id, name: m.league.name, image: m.league.image_url },
    serie: m.serie?.full_name || m.serie?.name || null,
    tournament: m.tournament && {
      id: m.tournament.id,
      name: m.tournament.name,
      tier: m.tournament.tier,
      prizepool: m.tournament.prizepool ?? null,
      region: m.tournament.region ?? null,
    },
    teams: (m.opponents ?? []).map(({ opponent }) => ({ ...slimTeam(opponent), score: scores.get(opponent.id) ?? null })),
    winner_id: m.winner_id,
    draw: m.draw,
    forfeit: m.forfeit,
    streams: (m.streams_list ?? [])
      .filter(s => s.raw_url)
      .map(s => ({ url: s.raw_url, lang: s.language, official: s.official, main: s.main })),
    games: (m.games ?? [])
      .map(g => ({ position: g.position, status: g.status, winner_id: g.winner?.id ?? null, length: g.length ?? null }))
      .sort((a, b) => a.position - b.position),
  };
}

function slimStanding(s) {
  return {
    rank: s.rank,
    team: slimTeam(s.team),
    wins: s.wins ?? null,
    losses: s.losses ?? null,
    ties: s.ties ?? null,
    total: s.total ?? null,
    game_wins: s.game_wins ?? null,
    game_losses: s.game_losses ?? null,
    last_match: s.last_match
      ? { status: s.last_match.status, winner_id: s.last_match.winner_id, begin_at: s.last_match.begin_at }
      : null,
  };
}

function slimTournament(t, standings) {
  return {
    id: t.id,
    name: t.name,
    tier: t.tier,
    begin_at: t.begin_at,
    end_at: t.end_at,
    region: t.region ?? null,
    prizepool: t.prizepool ?? null,
    has_bracket: t.has_bracket ?? false,
    league: t.league && { id: t.league.id, name: t.league.name, image: t.league.image_url },
    serie: t.serie?.full_name || t.serie?.name || null,
    standings,
  };
}

// Biten maçlar değişmediği için geçmiş önbellekte birikir; her çalıştırmada yalnızca son 2 gün istenir.
async function fetchHistory(now) {
  const file = join(CACHE_DIR, 'history.json');
  const cache = await readJson(file, { matches: {} });
  const known = Object.keys(cache.matches).length;
  const from = known ? now - 2 * DAY : now - DAYS_HISTORY * DAY;
  // PandaScore, tarihi boş iptal maçlarını -begin_at sıralamasında başa koyuyor; bu yüzden
  // yalnızca bitmiş maçlar ve tarih aralığıyla istenir.
  const fresh = await pages('/matches/past', {
    'filter[videogame]': GAME,
    'filter[status]': 'finished',
    'range[begin_at]': `${isoSec(from)},${isoSec(now)}`,
    sort: '-begin_at',
  }, () => false, known ? MAX_PAGES : MAX_HISTORY_PAGES);
  for (const m of fresh) cache.matches[m.id] = slimMatch(m);
  for (const [id, m] of Object.entries(cache.matches)) {
    if (time(m) < now - DAYS_HISTORY * DAY) delete cache.matches[id];
  }
  await writeJson(file, cache);
  console.log(`geçmiş: ${fresh.length} yeni/güncel, önbellekte ${Object.keys(cache.matches).length} maç (${DAYS_HISTORY} gün)`);
  return Object.values(cache.matches);
}

// Kadrolar 12 saatte bir yenilenir; bir istekte 100 takım.
async function fetchRosters(ids, now) {
  const file = join(CACHE_DIR, 'rosters.json');
  const cache = await readJson(file, {});
  const stale = [...ids].filter(id => !cache[id] || now - cache[id].t > ROSTER_TTL);
  let requests = 0;
  for (let i = 0; i < stale.length && requests < MAX_ROSTER_REQUESTS; i += 100) {
    const chunk = stale.slice(i, i + 100);
    requests++;
    try {
      const { data } = await api('/teams', { 'filter[id]': chunk.join(','), per_page: 100 });
      for (const id of chunk) cache[id] = { t: now, team: null };
      for (const t of data) {
        cache[t.id] = {
          t: now,
          team: {
            ...slimTeam(t),
            location: t.location ?? null,
            players: (t.players ?? []).filter(p => p.active !== false).map(slimPlayer),
          },
        };
      }
    } catch (err) {
      console.warn(`kadrolar alınamadı: ${err.message}`);
      break;
    }
  }
  for (const [id, v] of Object.entries(cache)) {
    if (now - v.t > 7 * DAY) delete cache[id];
  }
  await writeJson(file, cache);
  console.log(`kadrolar: ${requests} istek, ${stale.length} eski/eksik takım`);
  return Object.fromEntries(Object.entries(cache).filter(([, v]) => v.team).map(([id, v]) => [id, v.team]));
}

// İki takımın aralarındaki son 5 maç; 30 günlük geçmişin dışına da bakmak için takım çifti başına
// PandaScore'a sorulur. Sonuçlar 7 gün önbellekte kalır; arada oynanan yeni maçlar geçmişten eklenir.
// Önce canlı, sonra yaklaşan (üst seviye ve yakın olanlar önde), en son biten maçların çiftleri sorulur.
async function fetchHeadToHead(matches, now) {
  const file = join(CACHE_DIR, 'h2h.json');
  const cache = await readJson(file, {});
  const pairs = new Map();
  for (const m of matches) {
    const [a, b] = m.teams;
    if (a?.id != null && b?.id != null && !pairs.has(pairKey(a.id, b.id))) pairs.set(pairKey(a.id, b.id), [a.id, b.id]);
  }
  let requests = 0;
  let left = 0;
  let stopped = false;
  for (const [key, [a, b]] of pairs) {
    if (cache[key] && now - cache[key].t < H2H_TTL) continue;
    if (stopped || requests >= MAX_H2H_REQUESTS) { left++; continue; }
    requests++;
    try {
      const { data } = await api(`/teams/${a}/matches`, {
        'filter[opponent_id]': b, 'filter[status]': 'finished', sort: '-begin_at', per_page: 10,
      });
      // Filtre beklendiği gibi çalışmasa bile yalnızca iki takımın da oynadığı maçlar alınır.
      const meetings = data
        .filter(m => m.begin_at && m.winner_id != null && (m.opponents ?? []).some(o => o.opponent?.id === b))
        .map(m => toMeeting(slimMatch(m)))
        .slice(0, 5);
      cache[key] = { t: now, meetings };
    } catch (err) {
      console.warn(`aralarındaki maçlar alınamadı (${key}): ${err.message}`);
      stopped = true;
      left++;
    }
  }
  for (const [key, v] of Object.entries(cache)) {
    if (now - v.t > 30 * DAY) delete cache[key];
  }
  await writeJson(file, cache);
  const found = [...pairs.keys()].filter(k => cache[k]?.meetings.length).length;
  console.log(`aralarındaki maçlar: ${requests} istek, ${found}/${pairs.size} çiftin geçmişi var, ${left} çift sonraki çalıştırmaya kaldı`);
  return Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, v.meetings]));
}

async function fetchLive() {
  const now = Date.now();
  const filter = { 'filter[videogame]': GAME };

  const running = await pages('/matches/running', { ...filter, sort: 'begin_at' });
  const upcoming = await pages('/matches/upcoming', { ...filter, sort: 'begin_at' },
    last => time(last) > now + DAYS_AHEAD * DAY);
  console.log(`maçlar: ${running.length} canlı, ${upcoming.length} yaklaşan`);
  const history = await fetchHistory(now);

  // Önce üst seviye turnuvalar, eşitlikte elimizde daha çok maçı olanlar.
  const matchCount = new Map();
  for (const m of [...running, ...upcoming]) matchCount.set(m.tournament_id, (matchCount.get(m.tournament_id) ?? 0) + 1);
  for (const m of history) matchCount.set(m.tournament?.id, (matchCount.get(m.tournament?.id) ?? 0) + 1);
  const tournaments = (await pages('/tournaments/running', {}))
    .filter(t => t.videogame?.slug === GAME)
    .sort((a, b) =>
      (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) ||
      (matchCount.get(b.id) ?? 0) - (matchCount.get(a.id) ?? 0))
    .slice(0, MAX_STANDINGS);

  const withStandings = [];
  for (const t of tournaments) {
    let standings = null;
    try {
      const { data } = await api(`/tournaments/${t.id}/standings`, { per_page: 100 });
      standings = data.map(slimStanding);
    } catch (err) {
      console.warn(`puan durumu alınamadı (${t.id}): ${err.message}`);
    }
    withStandings.push(slimTournament(t, standings));
  }
  console.log(`turnuvalar: ${withStandings.length}`);

  const slimUpcoming = upcoming.filter(m => time(m) <= now + DAYS_AHEAD * DAY || !time(m)).map(slimMatch);
  const ids = new Set();
  for (const m of [...running.map(slimMatch), ...slimUpcoming, ...history.filter(m => time(m) >= now - DAYS_BACK * DAY)]) {
    for (const t of m.teams) if (t.id != null) ids.add(t.id);
  }
  for (const t of withStandings) for (const s of t.standings ?? []) if (s.team?.id != null) ids.add(s.team.id);
  const rosters = await fetchRosters(ids, now);
  const recentPast = history.filter(m => time(m) >= now - DAYS_BACK * DAY).sort((a, b) => time(b) - time(a));
  const byPriority = list => [...list].sort((a, b) => tierRank(a) - tierRank(b) || time(a) - time(b));
  const h2h = await fetchHeadToHead([...running.map(slimMatch), ...byPriority(slimUpcoming), ...byPriority(recentPast)], now);

  return { demo: false, running: running.map(slimMatch), upcoming: slimUpcoming, history, tournaments: withStandings, rosters, h2h };
}

// Listeleri ve maç detayı için takım verisini birleştirir.
function assemble({ demo, running, upcoming, history, tournaments, rosters, h2h: fetchedH2h = {} }) {
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const past = history.filter(m => time(m) >= now - DAYS_BACK * DAY).sort((a, b) => time(b) - time(a));
  const shown = [...running, ...upcoming, ...past];
  const byTeam = indexByTeam(history);

  for (const t of tournaments) {
    if (!t.standings?.length) continue;
    const records = tournamentRecords(t.id, history, [...running, ...upcoming]);
    for (const s of t.standings) {
      const r = records.get(s.team?.id);
      s.record = r ? { wins: r.wins, losses: r.losses } : null;
      s.recent = r?.last ?? null;
      s.next = r?.next ?? null;
    }
  }

  const known = new Map();
  for (const m of [...history, ...shown]) for (const t of m.teams) if (t.id != null) known.set(t.id, t);
  for (const t of tournaments) for (const s of t.standings ?? []) if (s.team?.id != null && !known.has(s.team.id)) known.set(s.team.id, s.team);

  const ids = new Set();
  for (const m of shown) for (const t of m.teams) if (t.id != null) ids.add(t.id);
  for (const t of tournaments) for (const s of t.standings ?? []) if (s.team?.id != null) ids.add(s.team.id);

  const teams = {};
  for (const id of ids) {
    const info = rosters[id] ?? known.get(id);
    teams[id] = {
      id,
      name: info.name,
      acronym: info.acronym ?? null,
      image: info.image ?? null,
      image_dark: info.image_dark ?? null,
      location: info.location ?? null,
      players: info.players ?? [],
      ...teamSummary(id, byTeam.get(id) ?? []),
    };
  }

  const h2h = {};
  for (const m of shown) {
    const [a, b] = m.teams;
    if (a?.id == null || b?.id == null) continue;
    const key = pairKey(a.id, b.id);
    if (key in h2h) continue;
    const meetings = mergeMeetings([fetchedH2h[key] ?? [], headToHead(a.id, b.id, byTeam.get(a.id) ?? [])], 6);
    if (meetings.length) h2h[key] = meetings;
  }

  return {
    main: {
      generated_at: generatedAt,
      demo,
      source: demo ? 'Demo' : 'PandaScore',
      range: { days_back: DAYS_BACK, days_ahead: DAYS_AHEAD, days_history: DAYS_HISTORY, h2h_limit: 5 },
      running,
      upcoming,
      past,
      tournaments,
    },
    teams: { generated_at: generatedAt, teams, h2h },
  };
}

// Liquipedia'yı tanıtan User-Agent ister; iş akışında deponun adresi iletişim bilgisi olarak eklenir.
function userAgent() {
  const repo = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'local development';
  const contact = process.env.LIQUIPEDIA_CONTACT ? `; ${process.env.LIQUIPEDIA_CONTACT}` : '';
  return `CS2EsportsCenter/1.0 (${repo}${contact})`;
}

// Takım ve oyunculara Liquipedia sayfası ekler. Önce ekranda en çok görünenler, oyuncular en son.
async function addLiquipedia({ main, teams }) {
  const teamObjects = [];
  const players = [];
  for (const m of [...main.running, ...main.upcoming, ...main.past]) teamObjects.push(...m.teams);
  for (const t of main.tournaments) for (const s of t.standings ?? []) if (s.team) teamObjects.push(s.team);
  for (const t of Object.values(teams.teams)) {
    teamObjects.push(t, ...t.form.map(f => f.opp));
    players.push(...t.players);
  }
  const entries = [...teamObjects, ...players].filter(o => o?.name).map(o => ({ wiki: WIKI, name: o.name, obj: o }));

  try {
    const { lookup, requests, left } = await resolveLiquipedia(entries, {
      cacheFile: join(CACHE_DIR, 'liquipedia.json'),
      userAgent: userAgent(),
      maxRequests: LIQUIPEDIA_MAX_REQUESTS,
    });
    let linked = 0;
    for (const e of entries) {
      e.obj.liquipedia = lookup(e.wiki, e.name);
      linked += Boolean(e.obj.liquipedia);
    }
    console.log(`liquipedia: ${requests} istek, ${linked}/${entries.length} bağlantı, ${left} ad sonraki çalıştırmaya kaldı`);
  } catch (err) {
    // Liquipedia erişilemezse site yine de yayınlansın.
    console.warn(`Liquipedia atlandı: ${err.message}`);
  }
}

const demo = process.argv.includes('--demo') || !TOKEN;
if (demo && !process.argv.includes('--demo')) {
  console.warn('PANDASCORE_TOKEN tanımlı değil, demo veri yazılıyor.');
}
const out = assemble(demo ? buildDemoData() : await fetchLive());
// Demo takımları kurgusal olduğu için Liquipedia'da aranmaz.
if (!demo && LIQUIPEDIA) await addLiquipedia(out);
await writeJson(join(DATA_DIR, 'cs2.json'), out.main);
await writeJson(join(DATA_DIR, 'teams.json'), out.teams);
console.log(`yazıldı: ${DATA_DIR}/cs2.json, teams.json (${Object.keys(out.teams.teams).length} takım)`);
