import { GAME_ICONS } from './game-icons.js';

const DATA_URL = 'data/esports.json';
const REFRESH_MS = 60_000;

// PandaScore oyun kısa adlarına göre etiket ve renkler. Simgesi olmayan oyunlar `mono` kısaltmasıyla,
// listede olmayanlar verideki adla gösterilir.
const GAMES = {
  'league-of-legends': { short: 'LoL', name: 'League of Legends', color: '#c9a24a' },
  'cs-go': { short: 'CS2', name: 'Counter-Strike 2', color: '#f0a020' },
  'valorant': { short: 'Valorant', name: 'Valorant', color: '#ff4655' },
  'dota-2': { short: 'Dota 2', name: 'Dota 2', color: '#d8432f' },
  'ow': { short: 'Overwatch', name: 'Overwatch 2', color: '#f99e1a', mono: 'OW' },
  'r6-siege': { short: 'R6 Siege', name: 'Rainbow Six Siege', color: '#5b8def', mono: 'R6' },
  'rl': { short: 'Rocket League', name: 'Rocket League', color: '#2a9df4', mono: 'RL' },
  'pubg': { short: 'PUBG', name: 'PUBG', color: '#e8b931' },
  'mlbb': { short: 'MLBB', name: 'Mobile Legends', color: '#9b7bff', mono: 'ML' },
  'cod-mw': { short: 'CoD', name: 'Call of Duty', color: '#7cb342', mono: 'CoD' },
  'fifa': { short: 'EA FC', name: 'EA Sports FC', color: '#22b573', mono: 'FC' },
  'lol-wild-rift': { short: 'Wild Rift', name: 'LoL: Wild Rift', color: '#3fb6c8', mono: 'WR' },
  'kog': { short: 'KoG', name: 'King of Glory', color: '#e0703a', mono: 'KoG' },
  'starcraft-2': { short: 'SC II', name: 'StarCraft II', color: '#4f9fd8', mono: 'SC2' },
  'starcraft-brood-war': { short: 'SC:BW', name: 'StarCraft: Brood War', color: '#8a94a6', mono: 'BW' },
};
const GAME_ORDER = Object.keys(GAMES);
const TABS = ['canli', 'yaklasan', 'sonuclar', 'ligler'];
const BIG_TIERS = new Set(['s', 'a']);
const TIER_ORDER = { s: 0, a: 1, b: 2, c: 3, d: 4, unranked: 5 };
const TBD = { id: null, name: 'Belirlenecek', acronym: '?', score: null, tbd: true };

const PLATFORMS = [
  ['twitch.tv', 'Twitch'], ['youtube.com', 'YouTube'], ['youtu.be', 'YouTube'], ['kick.com', 'Kick'],
  ['sooplive', 'SOOP'], ['afreecatv', 'SOOP'], ['chzzk.naver.com', 'CHZZK'], ['huya.com', 'Huya'],
  ['douyu.com', 'Douyu'], ['bilibili.com', 'Bilibili'], ['facebook.com', 'Facebook'], ['trovo.live', 'Trovo'],
  ['tiktok.com', 'TikTok'],
];

const ICONS = {
  live: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  results: '<path d="m9 11 3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
};
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

const state = { data: null, error: null, tab: null, game: 'all', tournament: null, query: '', bigOnly: false };

const $ = sel => document.querySelector(sel);
const view = $('#view');

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* gizli mod vb. */ } },
};

/* ---------- Biçimlendirme ---------- */
const fmtTime = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const fmtNum = new Intl.NumberFormat('tr-TR');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = s => String(s ?? '').toLocaleLowerCase('tr');
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function relative(ms) {
  const min = Math.round(Math.abs(ms) / 60_000);
  let text;
  if (min < 1) text = 'az';
  else if (min < 60) text = `${min} dk`;
  else if (min < 1440) text = `${Math.floor(min / 60)} sa${min % 60 ? ` ${min % 60} dk` : ''}`;
  else text = `${Math.floor(min / 1440)} gün`;
  return `${text} ${ms >= 0 ? 'sonra' : 'önce'}`;
}

function dayName(date) {
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  return { 0: 'Bugün', 1: 'Yarın', '-1': 'Dün' }[diff] ?? null;
}

function prize(value) {
  const m = /^(\d+)\s+(.+)$/.exec(value ?? '');
  if (!m) return value ?? '';
  const symbol = { 'United States Dollar': '$', Euro: '€', 'Turkish Lira': '₺', 'British Pound': '£' }[m[2]];
  return symbol ? `${symbol}${fmtNum.format(m[1])}` : `${fmtNum.format(m[1])} ${m[2]}`;
}

function gameInfo(game) {
  return GAMES[game?.slug] ?? { short: game?.name ?? 'Diğer', name: game?.name ?? 'Diğer', color: null };
}

// Açık renkli oyun karolarında simge koyu, diğerlerinde beyaz olsun.
function ink(hex) {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.34 ? '#15171c' : '#ffffff';
}
const gameStyle = info => (info.color ? ` style="--g:${info.color};--ink:${ink(info.color)}"` : '');

function gameIcon(game, size = '') {
  const info = gameInfo(game);
  const path = GAME_ICONS[game?.slug];
  const glyph = path
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`
    : `<b aria-hidden="true">${esc(info.mono ?? initials({ name: info.name }))}</b>`;
  return `<span class="gicon ${size}"${gameStyle(info)} role="img" aria-label="${esc(info.name)}" title="${esc(info.name)}">${glyph}</span>`;
}
const gameTag = (game, { full = false } = {}) =>
  `<span class="game-tag">${gameIcon(game, 'sm')}${esc(full ? gameInfo(game).name : gameInfo(game).short)}</span>`;

function boLabel(m) {
  if (!m.bo) return '';
  if (m.type === 'first_to') return `İlk ${m.bo}`;
  if (m.type === 'all_games_played') return `${m.bo} oyun`;
  return `Bo${m.bo}`;
}

const tierRank = item => TIER_ORDER[item.tournament?.tier ?? item.tier] ?? 9;
const tierBadge = tier => (tier && tier !== 'unranked' ? `<span class="tier ${esc(tier)}" title="Turnuva seviyesi">${esc(tier)}</span>` : '');
const subtitle = m => [m.serie, m.tournament?.name].filter(Boolean).join(' · ');

function initials(entity) {
  if (!entity?.name) return '?';
  if (entity.acronym && entity.acronym.length <= 4) return entity.acronym;
  return entity.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

// Logosu olmayan takımlar için addan türetilen sabit bir renk tonu.
function hue(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function logo(entity, size = '') {
  const dark = document.documentElement.dataset.theme === 'dark';
  const src = safeUrl((dark && entity?.image_dark) || entity?.image);
  const text = esc(initials(entity));
  const h = entity?.tbd || !entity?.name ? null : hue(entity.name);
  if (!src) return `<span class="logo ${size} avatar"${h == null ? '' : ` style="--h:${h}"`} aria-hidden="true">${text}</span>`;
  return `<img class="logo ${size}" src="${esc(src)}" alt="" loading="lazy" decoding="async" data-initials="${text}" data-hue="${h ?? ''}">`;
}

// Takım logosu + adı; Liquipedia sayfası bulunduysa ikisi birlikte o sayfaya bağlanır.
function teamEl(team, { size = '', rev = false } = {}) {
  const url = safeUrl(team?.liquipedia);
  const name = team?.name ?? '';
  const inner = `${logo(team, size)}<span class="name">${esc(name)}</span>`;
  const cls = `team${rev ? ' rev' : ''}`;
  return url
    ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(`${name} · Liquipedia`)}"
         aria-label="${esc(`${name}, Liquipedia sayfası (yeni sekme)`)}">${inner}</a>`
    : `<span class="${cls}" title="${esc(name)}">${inner}</span>`;
}

function platform(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return PLATFORMS.find(([key]) => host.includes(key))?.[1] ?? host;
}

// Önce ana (her zaman resmi) yayın, sonra diğer resmi yayınlar, en son geri kalanlar.
function streamsOf(m) {
  const seen = new Set();
  const rank = s => (s.main ? 0 : s.official ? 1 : 2);
  return (m.streams ?? [])
    .map(s => ({ ...s, url: safeUrl(s.url) }))
    .filter(s => s.url && !seen.has(s.url) && seen.add(s.url))
    .sort((a, b) => rank(a) - rank(b));
}

function sides(m) {
  const teams = m.teams ?? [];
  return [teams[0] ?? TBD, teams[1] ?? TBD];
}

/* ---------- Filtreleme ---------- */
function searchText(item) {
  const teams = item.teams ?? item.standings?.map(s => s.team) ?? [];
  return norm([
    item.league?.name, item.serie, item.tournament?.name ?? item.name,
    ...teams.flatMap(t => [t?.name, t?.acronym]),
  ].join(' '));
}

function filterItems(list, ignoreGame = false) {
  const q = norm(state.query.trim());
  return list.filter(item =>
    (ignoreGame || state.game === 'all' || item.game?.slug === state.game) &&
    (!state.bigOnly || BIG_TIERS.has(item.tournament?.tier ?? item.tier)) &&
    (!q || searchText(item).includes(q)));
}

const filtersActive = () => Boolean(state.query.trim() || state.game !== 'all' || state.bigOnly);

/* ---------- Görünümler ---------- */
function empty(icon, title, body = '') {
  const hint = filtersActive() ? ' <a href="#" data-action="clear">Filtreleri temizle</a>' : '';
  return `<div class="empty"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg><b>${title}</b><span>${body}${hint}</span></div>`;
}

// Ana yayınla aynı dildeki alternatifler platform adıyla, farklı dildekiler dil koduyla gösterilir.
function altStreams(list, main) {
  if (!list.length) return '';
  return `<div class="alt-streams">${list.slice(0, 4).map(s => {
    const lang = s.lang?.toUpperCase();
    const text = lang && s.lang !== main?.lang ? lang : platform(s.url);
    return `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="${s.lang === 'tr' ? 'tr' : ''}"
      title="${esc(`${platform(s.url)}${lang ? ` · ${lang}` : ''}`)}">${esc(text)}</a>`;
  }).join('')}</div>`;
}

function teamRow(team, trailing) {
  return `<div class="team-row${trailing ? ' trailing' : ''}">${teamEl(team)}
    <span class="score">${esc(team.score ?? 0)}</span></div>`;
}

function liveCard(m) {
  const [a, b] = sides(m);
  const [main, ...rest] = streamsOf(m);
  const lead = (a.score ?? 0) === (b.score ?? 0) ? null : (a.score ?? 0) > (b.score ?? 0) ? 'a' : 'b';
  const started = Date.parse(m.begin_at);
  const sub = subtitle(m);
  const watch = main
    ? `<a class="watch stretched" href="${esc(main.url)}" target="_blank" rel="noopener"
         aria-label="${esc(`${a.name} - ${b.name} canlı izle, ${platform(main.url)} (yeni sekme)`)}">
         ${PLAY}İzle<span class="via">· ${esc(platform(main.url))}${main.lang ? ` ${esc(main.lang.toUpperCase())}` : ''}</span></a>`
    : '<span class="no-stream">Yayın bilgisi yok</span>';
  return `<article class="card${main ? ' clickable' : ''}">
    <div class="card-head">
      <span class="badge-live"><i></i>CANLI</span>
      ${gameIcon(m.game)}
      ${started ? `<span class="since">${esc(relative(started - Date.now()).replace('önce', 'önce başladı'))}</span>` : ''}
    </div>
    <div class="card-league">${logo(m.league, 'sm')}<span><b>${esc(m.league?.name)}</b>${sub ? ` · ${esc(sub)}` : ''}</span></div>
    <div class="teams">${teamRow(a, lead === 'b')}${teamRow(b, lead === 'a')}</div>
    <div class="card-foot">${watch}${altStreams(rest, main)}<span class="bo">${esc(boLabel(m))}</span></div>
  </article>`;
}

function matchRow(m, { withDate = false } = {}) {
  const [a, b] = sides(m);
  const [main] = streamsOf(m);
  const live = m.status === 'running';
  const finished = m.status === 'finished';
  const begin = Date.parse(m.begin_at);
  const until = begin - Date.now();

  let timeNote = '';
  if (live) timeNote = '<small class="soon">Canlı</small>';
  else if (withDate && begin) timeNote = `<small>${esc(dayName(new Date(begin)) ?? fmtShort.format(begin))}</small>`;
  else if (!finished && begin && until <= 0) timeNote = '<small class="soon">Başlamak üzere</small>';
  else if (!finished && begin && until < 86_400_000) {
    timeNote = `<small class="${until < 3_600_000 ? 'soon' : ''}">${esc(relative(until))}</small>`;
  }

  const winA = finished && m.winner_id != null && m.winner_id === a.id;
  const winB = finished && m.winner_id != null && m.winner_id === b.id;
  const side = (t, cls, lost) =>
    `<div class="side ${cls}${lost ? ' lose' : ''}${t.tbd ? ' tbd' : ''}">${teamEl(t, { rev: cls === 'a' })}</div>`;
  const mid = finished || live
    ? `<div class="mid score${live ? ' live' : ''}"><span class="${winB ? 'l' : ''}">${esc(a.score ?? 0)}</span><span class="l">:</span><span class="${winA ? 'l' : ''}">${esc(b.score ?? 0)}</span></div>`
    : '<div class="mid">vs</div>';

  const tags = [
    m.forfeit && '<span class="tag">Hükmen</span>',
    m.draw && '<span class="tag">Berabere</span>',
  ].filter(Boolean).join('');
  const sub = subtitle(m);
  const action = main
    ? `<a class="stream-link stretched" href="${esc(main.url)}" target="_blank" rel="noopener"
         aria-label="${esc(`${a.name} - ${b.name}: ${platform(main.url)} yayınını aç (yeni sekme)`)}">${PLAY}${esc(platform(main.url))}</a>`
    : '';

  return `<article class="row${main ? ' clickable' : ''}${live ? ' is-live' : ''}">
    <div class="row-time">${begin ? fmtTime.format(begin) : '—'}${timeNote}</div>
    <div class="row-match">${side(a, 'a', winB)}${mid}${side(b, 'b', winA)}</div>
    <div class="row-meta">
      <span class="league" title="${esc([m.league?.name, sub].filter(Boolean).join(' · '))}">${esc(m.league?.name)}${sub ? ` · ${esc(sub)}` : ''}</span>
      <span class="sub">${gameIcon(m.game, 'sm')}<span class="extra">${esc(boLabel(m))}</span>${tierBadge(m.tournament?.tier)}${tags}</span>
    </div>
    <div class="row-action">${action}</div>
  </article>`;
}

function byDay(items) {
  const groups = new Map();
  for (const m of items) {
    const begin = Date.parse(m.begin_at);
    const key = begin ? startOfDay(new Date(begin)) : 'tbd';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  return [...groups].map(([key, list]) => {
    if (key === 'tbd') return { title: 'Tarihi belirlenmedi', note: '', list };
    const date = new Date(key);
    const name = dayName(date);
    return { title: name ?? fmtDay.format(date), note: name ? fmtDay.format(date) : '', list };
  });
}

function dayList(items) {
  return byDay(items).map(({ title, note, list }) => `
    <section class="day">
      <h2 class="day-title">${esc(title)} <span>${note ? `${esc(note)} · ` : ''}${list.length} maç</span></h2>
      <div class="list">${list.map(m => matchRow(m)).join('')}</div>
    </section>`).join('');
}

function liveView(items) {
  if (!items.length) {
    const next = filterItems(state.data.upcoming)[0];
    let body = 'Canlı bir maç başladığında burada görünecek.';
    if (next) {
      const [a, b] = sides(next);
      const when = Date.parse(next.begin_at);
      body = `Sıradaki: <b>${esc(a.name)} – ${esc(b.name)}</b> (${esc(gameInfo(next.game).short)})${when ? `, ${esc(relative(when - Date.now()))}` : ''}.
        <a href="${routeHash({ tab: 'yaklasan' })}">Fikstüre git</a>`;
    }
    return empty('live', 'Şu anda canlı maç yok', body);
  }
  const sorted = [...items].sort((x, y) => tierRank(x) - tierRank(y));
  return `<div class="section-head"><h1>Şu an canlı</h1><p>${items.length} maç · Karta tıkla, resmi yayında izle</p></div>
    <div class="grid">${sorted.map(liveCard).join('')}</div>`;
}

function upcomingView(items) {
  if (!items.length) return empty('calendar', 'Yaklaşan maç bulunamadı');
  return dayList(items);
}

function resultsView(items) {
  if (!items.length) return empty('results', 'Sonuç bulunamadı');
  return dayList(items);
}

function standingsTable(t) {
  const rows = t.standings ?? [];
  if (!rows.length) return empty('trophy', 'Puan tablosu henüz yok', 'Turnuva ilerledikçe sıralama burada görünecek.');

  if (rows[0].wins == null) {
    const result = s => {
      const lm = s.last_match;
      if (!lm) return '<span class="muted">—</span>';
      const date = lm.begin_at ? ` <span class="muted">${esc(fmtShort.format(Date.parse(lm.begin_at)))}</span>` : '';
      if (lm.status === 'running') return '<span class="result-pill live">Oynuyor</span>';
      if (lm.status !== 'finished') return `<span class="result-pill lost">Sırada</span>${date}`;
      return lm.winner_id === s.team?.id
        ? `<span class="result-pill won">Galip</span>${date}`
        : `<span class="result-pill lost">Mağlup</span>${date}`;
    };
    return `<table class="standings"><thead><tr><th>#</th><th class="team">Takım</th><th>Son maç</th></tr></thead><tbody>
      ${rows.map(s => `<tr class="${s.rank <= 3 ? 'top' : ''}"><td class="rank">${esc(s.rank)}</td>
        <td class="team">${teamEl(s.team, { size: 'sm' })}</td><td>${result(s)}</td></tr>`).join('')}
    </tbody></table>`;
  }

  const ties = rows.some(s => s.ties);
  const diff = s => {
    if (s.game_wins == null || s.game_losses == null) return '<span class="muted">—</span>';
    const d = s.game_wins - s.game_losses;
    return `<span class="${d > 0 ? 'pos' : d < 0 ? 'neg' : 'muted'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}</span>`;
  };
  return `<table class="standings"><thead><tr><th>#</th><th class="team">Takım</th><th class="hide-sm" title="Oynanan">O</th>
      <th title="Galibiyet">G</th><th title="Mağlubiyet">M</th>${ties ? '<th title="Beraberlik">B</th>' : ''}<th title="Oyun / harita averajı">Av.</th></tr></thead><tbody>
    ${rows.map(s => `<tr class="${s.rank <= 3 ? 'top' : ''}"><td class="rank">${esc(s.rank)}</td>
      <td class="team">${teamEl(s.team, { size: 'sm' })}</td>
      <td class="hide-sm muted">${esc(s.total ?? s.wins + s.losses)}</td><td class="w">${esc(s.wins)}</td><td class="muted">${esc(s.losses)}</td>
      ${ties ? `<td class="muted">${esc(s.ties ?? 0)}</td>` : ''}<td>${diff(s)}</td></tr>`).join('')}
  </tbody></table>`;
}

function leaguePanel(t) {
  const d = state.data;
  const own = m => m.tournament?.id === t.id;
  const live = d.running.filter(own);
  const next = d.upcoming.filter(own).slice(0, 6);
  const recent = d.past.filter(own).slice(0, 6);
  const dates = [t.begin_at, t.end_at].map(v => (v ? fmtShort.format(Date.parse(v)) : '?')).join(' – ');
  const list = (title, items) => (items.length
    ? `<h3>${title}</h3><div class="list">${items.map(m => matchRow(m, { withDate: true })).join('')}</div>`
    : '');

  return `<section class="panel">
    <div class="panel-head">${logo(t.league, 'lg')}
      <div><h2>${esc(t.league?.name ?? t.name)}</h2>
        <p>${gameTag(t.game)}<span>${esc([t.serie, t.name].filter(Boolean).join(' · '))}</span>
          <span class="num">${esc(dates)}</span>${t.prizepool ? `<span>Ödül: ${esc(prize(t.prizepool))}</span>` : ''}${tierBadge(t.tier)}</p>
      </div>
    </div>
    <h3>Puan durumu</h3>
    ${standingsTable(t)}
    ${list('Canlı', live)}${list('Sıradaki maçlar', next)}${list('Son sonuçlar', recent)}
  </section>`;
}

function leaguesView(items) {
  if (!items.length) return empty('trophy', 'Aktif lig bulunamadı');
  const sorted = [...items].sort((x, y) => tierRank(x) - tierRank(y) || norm(x.league?.name).localeCompare(norm(y.league?.name), 'tr'));

  const groups = new Map();
  for (const t of sorted) {
    const slug = t.game?.slug ?? 'other';
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(t);
  }
  const order = slug => (GAME_ORDER.includes(slug) ? GAME_ORDER.indexOf(slug) : 99);
  const grouped = [...groups].sort(([x], [y]) => order(x) - order(y));
  const current = sorted.find(t => t.id === state.tournament) ?? grouped[0][1][0];
  const label = t => [t.serie, t.name].filter(Boolean).join(' · ');

  // Oyun adları İngilizce; lang="en" büyük harfe çevirirken "İ" oluşmasını önler.
  const aside = grouped.map(([, list]) => `
    <div class="league-group"><h3 lang="en">${gameTag(list[0].game, { full: true })}</h3>
      ${list.map(t => `<a class="league-item" href="${routeHash({ tournament: t.id })}" aria-current="${t.id === current.id}">
        ${logo(t.league)}<span class="txt"><b>${esc(t.league?.name ?? t.name)}</b><small>${esc(label(t))}</small></span>${tierBadge(t.tier)}</a>`).join('')}
    </div>`).join('');

  const select = grouped.map(([, list]) => `<optgroup label="${esc(gameInfo(list[0].game).name)}" lang="en">
    ${list.map(t => `<option value="${t.id}"${t.id === current.id ? ' selected' : ''}>${esc(`${t.league?.name ?? ''} — ${label(t)}`)}</option>`).join('')}
  </optgroup>`).join('');

  return `<div class="leagues">
    <aside class="league-list" aria-label="Aktif ligler">${aside}</aside>
    <div class="league-main">
      <select class="league-select" id="league-select" aria-label="Lig seç">${select}</select>
      ${leaguePanel(current)}
    </div>
  </div>`;
}

/* ---------- Yönlendirme ve çizim ---------- */
function routeHash(patch = {}) {
  const next = { tab: state.tab, game: state.game, tournament: null, ...patch };
  let hash = `#/${next.tab}`;
  if (next.game !== 'all' || next.tournament) hash += `/${encodeURIComponent(next.game)}`;
  if (next.tab === 'ligler' && next.tournament) hash += `/${next.tournament}`;
  return hash;
}

function parseHash() {
  const [tab, game, id] = location.hash.replace(/^#\/?/, '').split('/');
  return {
    tab: TABS.includes(tab) ? tab : null,
    game: game ? decodeURIComponent(game) : 'all',
    tournament: id ? Number(id) : null,
  };
}

function go(patch) {
  const hash = routeHash(patch);
  if (location.hash === hash) render();
  else location.hash = hash;
}

function renderNav() {
  const live = filterItems(state.data?.running ?? [], true).length;
  $('#live-count').textContent = live || '';
  document.body.classList.toggle('has-live', live > 0);
  for (const a of document.querySelectorAll('.tabs a')) {
    a.href = routeHash({ tab: a.dataset.tab });
    if (a.dataset.tab === state.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const toggle = $('#tier-toggle');
  toggle.setAttribute('aria-pressed', String(state.bigOnly));
}

function renderGames(items) {
  const d = state.data;
  const meta = new Map();
  for (const item of [...d.running, ...d.upcoming, ...d.past, ...d.tournaments]) {
    if (item.game?.slug && !meta.has(item.game.slug)) meta.set(item.game.slug, item.game);
  }
  const counts = new Map();
  for (const item of items) counts.set(item.game?.slug, (counts.get(item.game?.slug) ?? 0) + 1);
  const order = slug => (GAME_ORDER.includes(slug) ? GAME_ORDER.indexOf(slug) : 99);
  const slugs = [...meta.keys()].sort((x, y) => order(x) - order(y));

  const chip = (slug, text, count, icon = '') =>
    `<button class="chip" type="button" data-game="${esc(slug)}" aria-pressed="${state.game === slug}" title="${esc(text)}">
      ${icon}<span class="label">${esc(text)}</span><span class="n">${count}</span></button>`;
  $('#games').innerHTML = chip('all', 'Tümü', items.length) +
    slugs.map(slug => chip(slug, gameInfo(meta.get(slug)).short, counts.get(slug) ?? 0, gameIcon(meta.get(slug), 'sm'))).join('');
}

function renderFooter() {
  const d = state.data;
  if (!d) return;
  const at = Date.parse(d.generated_at);
  const source = d.demo
    ? 'Demo veri'
    : `Veri: <a href="https://pandascore.co" target="_blank" rel="noopener">PandaScore</a>
       · Takım sayfaları: <a href="https://liquipedia.net" target="_blank" rel="noopener">Liquipedia</a>`;
  $('#footer').innerHTML = `
    <span>${source} · Son güncelleme ${at ? `${fmtTime.format(at)} (${esc(relative(at - Date.now()))})` : '—'}
      · Son ${esc(d.range?.days_back ?? 7)} gün ve önümüzdeki ${esc(d.range?.days_ahead ?? 7)} gün</span>
    <span>Maça tıklayınca resmi yayın yeni sekmede açılır. Yayınlar ilgili kanallara aittir.</span>`;
}

function render() {
  const d = state.data;
  if (!d) {
    if (state.error) {
      const local = ['localhost', '127.0.0.1'].includes(location.hostname);
      view.innerHTML = empty('error', 'Veriler yüklenemedi', local
        ? 'Önce <code>node scripts/fetch-data.mjs --demo</code> komutunu çalıştırın.'
        : 'Veri dosyası henüz hazır değil. Birkaç dakika sonra tekrar deneyin.');
    }
    return;
  }
  state.tab ??= d.running.length ? 'canli' : 'yaklasan';
  const source = { canli: d.running, yaklasan: d.upcoming, sonuclar: d.past, ligler: d.tournaments }[state.tab];
  const views = { canli: liveView, yaklasan: upcomingView, sonuclar: resultsView, ligler: leaguesView };

  renderNav();
  renderGames(filterItems(source, true));
  const notice = d.demo
    ? `<div class="notice"><span><b>Demo veri gösteriliyor.</b> Takım ve lig adları örnektir; yayın bağlantıları resmi kanallara gider.
        Gerçek veride takım logoları görünür ve takıma tıklayınca Liquipedia sayfası açılır.
        Gerçek maçlar için depoya <code>PANDASCORE_TOKEN</code> secret'ını ekleyin.</span></div>`
    : '';
  view.innerHTML = notice + views[state.tab](filterItems(source));
  renderFooter();
}

function normalize(json) {
  const data = { running: [], upcoming: [], past: [], tournaments: [], ...json };
  const live = new Set(data.running.map(m => m.id));
  data.upcoming = data.upcoming.filter(m => !live.has(m.id));
  return data;
}

async function load() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = normalize(await res.json());
    state.error = null;
  } catch (err) {
    console.error('Veri yüklenemedi:', err);
    state.error = err;
  }
  render();
}

/* ---------- Olaylar ---------- */
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0a0c11' : '#f5f6fa';
}

$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  store.set('theme', next);
  setTheme(next);
  render();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (store.get('theme')) return;
  setTheme(e.matches ? 'dark' : 'light');
  render();
});

$('#tier-toggle').addEventListener('click', () => {
  state.bigOnly = !state.bigOnly;
  store.set('bigOnly', state.bigOnly ? '1' : '');
  render();
});

let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = e.target.value; render(); }, 120);
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    $('#search').focus();
  }
});

$('#games').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) go({ game: chip.dataset.game });
});

view.addEventListener('change', e => {
  if (e.target.id === 'league-select') go({ tournament: Number(e.target.value) });
});

view.addEventListener('click', e => {
  if (!e.target.closest('[data-action="clear"]')) return;
  e.preventDefault();
  state.query = '';
  state.bigOnly = false;
  store.set('bigOnly', '');
  $('#search').value = '';
  go({ game: 'all' });
});

// Logo yüklenemezse baş harflerle değiştir.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('logo')) return;
  const span = document.createElement('span');
  span.className = `${img.className} avatar`;
  if (img.dataset.hue) span.style.setProperty('--h', img.dataset.hue);
  span.setAttribute('aria-hidden', 'true');
  span.textContent = img.dataset.initials || '?';
  img.replaceWith(span);
}, true);

window.addEventListener('hashchange', () => {
  Object.assign(state, parseHash());
  render();
  window.scrollTo({ top: 0 });
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) load();
});

Object.assign(state, parseHash(), { bigOnly: store.get('bigOnly') === '1' });
load();
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
