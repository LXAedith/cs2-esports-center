#!/usr/bin/env node
// PandaScore'dan maç, turnuva ve puan durumu verisini çekip site/data/esports.json'a yazar.
// PANDASCORE_TOKEN yoksa (veya --demo verilirse) önizleme için demo veri üretir.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoData } from './demo-data.mjs';
import { resolveLiquipedia, WIKIS } from './liquipedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'data', 'esports.json');
const LIQUIPEDIA_CACHE = join(ROOT, 'cache', 'liquipedia.json');

const API = 'https://api.pandascore.co';
const TOKEN = process.env.PANDASCORE_TOKEN?.trim();
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD ?? 7);
const DAYS_BACK = Number(process.env.DAYS_BACK ?? 7);
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 6);
const MAX_STANDINGS = Number(process.env.MAX_STANDINGS ?? 40);
const LIQUIPEDIA = process.env.LIQUIPEDIA !== '0';
const LIQUIPEDIA_MAX_REQUESTS = Number(process.env.LIQUIPEDIA_MAX_REQUESTS ?? 20);
// e-soccer, e-basketball gibi simülasyon "sporları" günde yüzlerce maç üretir; varsayılan olarak dışarıda.
const GAMES = (process.env.GAMES ??
  'league-of-legends,cs-go,dota-2,valorant,ow,r6-siege,rl,pubg,cod-mw,fifa,mlbb,lol-wild-rift,kog,starcraft-2,starcraft-brood-war'
).split(',').map(s => s.trim()).filter(Boolean);

const DAY = 86_400_000;
const TIER_ORDER = { s: 0, a: 1, b: 2, c: 3, d: 4, unranked: 5 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, params = {}) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
    if (res.ok) return { data: await res.json(), total: Number(res.headers.get('x-total') ?? 0) };
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`PandaScore ${res.status} ${url.pathname}: ${(await res.text()).slice(0, 300)}`);
  }
}

// Sayfa sayfa çeker; `stop` son öğeye bakıp daha fazla sayfaya gerek olmadığını söyleyebilir.
async function pages(path, params, stop = () => false) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, total } = await api(path, { ...params, per_page: 100, page });
    out.push(...data);
    if (data.length < 100 || (total && out.length >= total) || stop(data.at(-1))) break;
  }
  return out;
}

const time = m => Date.parse(m.begin_at ?? m.scheduled_at ?? '') || 0;
const isoSec = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

function slimTeam(t) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    acronym: t.acronym ?? null,
    image: t.image_url ?? null,
    image_dark: t.dark_mode_image_url ?? null,
  };
}

function slimMatch(m) {
  const scores = new Map((m.results ?? []).map(r => [r.team_id ?? r.player_id, r.score]));
  return {
    id: m.id,
    status: m.status,
    begin_at: m.begin_at ?? m.scheduled_at,
    end_at: m.end_at,
    bo: m.number_of_games,
    type: m.match_type,
    game: { slug: m.videogame?.slug, name: m.videogame_title?.name ?? m.videogame?.name },
    league: m.league && { id: m.league.id, name: m.league.name, image: m.league.image_url },
    serie: m.serie?.full_name || m.serie?.name || null,
    tournament: m.tournament && { id: m.tournament.id, name: m.tournament.name, tier: m.tournament.tier },
    teams: (m.opponents ?? []).map(({ opponent }) => ({ ...slimTeam(opponent), score: scores.get(opponent.id) ?? null })),
    winner_id: m.winner_id,
    draw: m.draw,
    forfeit: m.forfeit,
    streams: (m.streams_list ?? [])
      .filter(s => s.raw_url)
      .map(s => ({ url: s.raw_url, lang: s.language, official: s.official, main: s.main })),
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
    game: { slug: t.videogame?.slug, name: t.videogame?.name },
    league: t.league && { id: t.league.id, name: t.league.name, image: t.league.image_url },
    serie: t.serie?.full_name || t.serie?.name || null,
    standings,
  };
}

async function fetchLive() {
  const now = Date.now();
  const filter = { 'filter[videogame]': GAMES.join(',') };

  const running = await pages('/matches/running', { ...filter, sort: 'begin_at' });
  const upcoming = await pages('/matches/upcoming', { ...filter, sort: 'begin_at' },
    last => time(last) > now + DAYS_AHEAD * DAY);
  // PandaScore, tarihi boş iptal maçlarını -begin_at sıralamasında başa koyuyor; bu yüzden yalnızca
  // bitmiş maçları ve tarih aralığıyla istiyoruz. Aralık reddedilirse aralıksız denenir.
  const pastParams = { ...filter, 'filter[status]': 'finished', sort: '-begin_at' };
  const pastStop = last => time(last) > 0 && time(last) < now - DAYS_BACK * DAY;
  let past;
  try {
    past = await pages('/matches/past', { ...pastParams, 'range[begin_at]': `${isoSec(now - DAYS_BACK * DAY)},${isoSec(now)}` }, pastStop);
  } catch (err) {
    if (!err.message.includes(' 400 ')) throw err;
    console.warn(`range[begin_at] kabul edilmedi, aralıksız deneniyor: ${err.message}`);
    past = await pages('/matches/past', pastParams, pastStop);
  }
  console.log(`maçlar: ${running.length} canlı, ${upcoming.length} yaklaşan, ${past.length} geçmiş`);

  // Önce üst seviye turnuvalar, eşitlikte elimizde daha çok maçı olanlar.
  const matchCount = new Map();
  for (const m of [...running, ...upcoming, ...past]) {
    matchCount.set(m.tournament_id, (matchCount.get(m.tournament_id) ?? 0) + 1);
  }
  const tournaments = (await pages('/tournaments/running', {}))
    .filter(t => GAMES.includes(t.videogame?.slug))
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

  return {
    generated_at: new Date().toISOString(),
    demo: false,
    source: 'PandaScore',
    range: { days_back: DAYS_BACK, days_ahead: DAYS_AHEAD },
    running: running.map(slimMatch),
    upcoming: upcoming.filter(m => time(m) <= now + DAYS_AHEAD * DAY || !time(m)).map(slimMatch),
    past: past
      .filter(m => m.status === 'finished' && time(m) >= now - DAYS_BACK * DAY)
      .map(slimMatch),
    tournaments: withStandings,
  };
}

// Liquipedia'yı tanıtan User-Agent ister; iş akışında deponun adresi iletişim bilgisi olarak eklenir.
function userAgent() {
  const repo = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'local development';
  const contact = process.env.LIQUIPEDIA_CONTACT ? `; ${process.env.LIQUIPEDIA_CONTACT}` : '';
  return `EsporMerkezi/1.0 (${repo}${contact})`;
}

// Takımlara Liquipedia sayfası ekler. Önce ekranda en çok görünenler (canlı, yaklaşan, puan durumu).
async function addLiquipedia(data) {
  const entries = [];
  const visit = (game, team) => {
    const wiki = WIKIS[game?.slug];
    if (wiki && team?.name) entries.push({ wiki, name: team.name, team });
  };
  for (const m of [...data.running, ...data.upcoming]) m.teams.forEach(t => visit(m.game, t));
  for (const t of data.tournaments) t.standings?.forEach(s => visit(t.game, s.team));
  for (const m of data.past) m.teams.forEach(t => visit(m.game, t));

  try {
    const { lookup, requests, left } = await resolveLiquipedia(entries, {
      cacheFile: LIQUIPEDIA_CACHE,
      userAgent: userAgent(),
      maxRequests: LIQUIPEDIA_MAX_REQUESTS,
    });
    let linked = 0;
    for (const e of entries) {
      e.team.liquipedia = lookup(e.wiki, e.name);
      linked += Boolean(e.team.liquipedia);
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
const data = demo ? buildDemoData() : await fetchLive();
// Demo takımları kurgusal olduğu için Liquipedia'da aranmaz.
if (!demo && LIQUIPEDIA) await addLiquipedia(data);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));
console.log(`yazıldı: ${OUT}`);
