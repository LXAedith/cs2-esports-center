const DATA_URL = 'data/cs2.json';
const TEAMS_URL = 'data/teams.json';
const REFRESH_MS = 60_000;

const LIST_VIEWS = ['canli', 'yaklasan', 'sonuclar', 'turnuvalar'];
const TIERS = [['s', 'S'], ['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['other', 'Diğer']];
const TIER_ORDER = { s: 0, a: 1, b: 2, c: 3, d: 4, unranked: 5 };
const TBD = { id: null, name: 'Belirlenecek', acronym: '?', score: null, tbd: true };
const TITLE = 'CS2 Esports Center — Canlı CS2 maçları, fikstür ve istatistikler';

const PLATFORMS = [
  ['twitch.tv', 'Twitch'], ['youtube.com', 'YouTube'], ['youtu.be', 'YouTube'], ['kick.com', 'Kick'],
  ['sooplive', 'SOOP'], ['afreecatv', 'SOOP'], ['chzzk.naver.com', 'CHZZK'], ['huya.com', 'Huya'],
  ['douyu.com', 'Douyu'], ['bilibili.com', 'Bilibili'], ['facebook.com', 'Facebook'], ['trovo.live', 'Trovo'],
  ['tiktok.com', 'TikTok'],
];

// 24x24 çizgi simgeler
const ICONS = {
  live: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  results: '<path d="m9 11 3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  flame: '<path d="M12 22c3.9 0 7-2.8 7-7 0-3.6-2.4-6.4-4.6-8.6.1 2.4-1 3.9-2.4 4.4.3-3-1.3-6.1-4.5-8.8.4 3.6-3.5 6.6-3.5 11.4C4 18.9 7.6 22 12 22z"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-4M13 17V8M18 17v-7"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  tv: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/>',
};
const PLAY = '<svg class="play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

const state = {
  data: null, error: null, teams: null, teamsLoading: null,
  view: null, tier: 'all', id: null, query: '', listHash: '#/canli',
};

const $ = sel => document.querySelector(sel);
const view = $('#view');
const scrollMemory = new Map();

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
const icon = (name, cls = '') => `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const pairKey = (x, y) => (x < y ? `${x}-${y}` : `${y}-${x}`);
const matchHash = id => `#/mac/${id}`;

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

const shortDate = ms => dayName(new Date(ms)) ?? fmtShort.format(ms);

function prize(value) {
  const m = /^(\d+)\s+(.+)$/.exec(value ?? '');
  if (!m) return value ?? '';
  const symbol = { 'United States Dollar': '$', Euro: '€', 'Turkish Lira': '₺', 'British Pound': '£' }[m[2]];
  return symbol ? `${symbol}${fmtNum.format(m[1])}` : `${fmtNum.format(m[1])} ${m[2]}`;
}

function boLabel(m) {
  if (!m.bo) return '';
  if (m.type === 'first_to') return `İlk ${m.bo}`;
  if (m.type === 'all_games_played') return `${m.bo} harita`;
  return `Bo${m.bo}`;
}

// Ülke kodundan bayrak emojisi (ör. "TR" → 🇹🇷)
function flag(code) {
  if (!/^[A-Za-z]{2}$/.test(code ?? '')) return '';
  const emoji = code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
  return `<span class="flag" title="${esc(code.toUpperCase())}">${emoji}</span>`;
}

const tierKey = item => {
  const tier = item.tournament?.tier ?? item.tier;
  return ['s', 'a', 'b', 'c', 'd'].includes(tier) ? tier : 'other';
};
const tierRank = item => TIER_ORDER[item.tournament?.tier ?? item.tier] ?? 9;
const tierBadge = tier => (tier && tier !== 'unranked'
  ? `<span class="tier t-${esc(tier)}" title="${esc(tier.toUpperCase())} seviye turnuva">${esc(tier)}</span>` : '');
const subtitle = m => [m.serie, m.tournament?.name].filter(Boolean).join(' · ');

function initials(entity) {
  if (!entity?.name) return '?';
  if (entity.acronym && entity.acronym.length <= 4) return entity.acronym;
  const words = entity.name.split(/\s+/);
  return (words.length > 1 ? words.map(w => w[0]).join('') : entity.name.slice(0, 2)).slice(0, 3).toUpperCase();
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

// Takım/oyuncu logosu + adı; Liquipedia sayfası bulunduysa ikisi birlikte o sayfaya bağlanır.
function teamEl(team, { size = '', rev = false, cls = '' } = {}) {
  const url = safeUrl(team?.liquipedia);
  const name = team?.name ?? '';
  const inner = `${logo(team, size)}<span class="name">${esc(name)}</span>`;
  const classes = ['team', rev && 'rev', cls].filter(Boolean).join(' ');
  return url
    ? `<a class="${classes}" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(`${name} · Liquipedia`)}"
         aria-label="${esc(`${name}, Liquipedia sayfası (yeni sekme)`)}">${inner}</a>`
    : `<span class="${classes}" title="${esc(name)}">${inner}</span>`;
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

const allMatches = () => [...state.data.running, ...state.data.upcoming, ...state.data.past];
const findMatch = id => allMatches().find(m => m.id === id);

/* ---------- Filtreleme ---------- */
function searchText(item) {
  const teams = item.teams ?? item.standings?.map(s => s.team) ?? [];
  return norm([
    item.league?.name, item.serie, item.tournament?.name ?? item.name, item.stage,
    ...teams.flatMap(t => [t?.name, t?.acronym]),
  ].join(' '));
}

function filterItems(list, ignoreTier = false) {
  const q = norm(state.query.trim());
  return list.filter(item =>
    (ignoreTier || state.tier === 'all' || tierKey(item) === state.tier) &&
    (!q || searchText(item).includes(q)));
}

const filtersActive = () => Boolean(state.query.trim() || state.tier !== 'all');

/* ---------- Liste görünümleri ---------- */
function empty(iconName, title, body = '') {
  const hint = filtersActive() ? ' <a href="#" data-action="clear">Filtreleri temizle</a>' : '';
  return `<div class="empty">${icon(iconName)}<b>${title}</b><span>${body}${hint}</span></div>`;
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

function mapStrip(m, a, b) {
  if (!m.games?.length) return '';
  return `<div class="map-strip" aria-label="Harita durumu">${m.games.map(g => {
    const winner = g.winner_id == null ? null : g.winner_id === a.id ? a : g.winner_id === b.id ? b : null;
    const cls = g.status === 'running' ? 'live' : winner ? (winner === a ? 'won-a' : 'won-b') : 'idle';
    const label = g.status === 'running' ? 'Oynanıyor' : winner ? initials(winner) : '—';
    return `<span class="mp ${cls}" title="${esc(`Harita ${g.position}${winner ? `: ${winner.name}` : ''}`)}"><b>H${g.position}</b>${esc(label)}</span>`;
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
  const watch = main
    ? `<a class="watch" href="${esc(main.url)}" target="_blank" rel="noopener"
         aria-label="${esc(`${a.name} - ${b.name} canlı izle, ${platform(main.url)} (yeni sekme)`)}">
         ${PLAY}İzle<span class="via">${esc(platform(main.url))}${main.lang ? ` ${esc(main.lang.toUpperCase())}` : ''}</span></a>`
    : '<span class="no-stream">Yayın yok</span>';
  return `<article class="card">
    <a class="stretched" href="${matchHash(m.id)}" aria-label="${esc(`${a.name} - ${b.name} maç detayı`)}"></a>
    <div class="card-head">
      <span class="badge-live"><i></i>CANLI</span>${tierBadge(m.tournament?.tier)}
      ${started ? `<span class="since">${esc(relative(started - Date.now()).replace('önce', 'önce başladı'))}</span>` : ''}
    </div>
    <div class="card-league">${logo(m.league, 'sm')}<span><b>${esc(m.league?.name)}</b>${m.stage ? ` · ${esc(m.stage)}` : subtitle(m) ? ` · ${esc(subtitle(m))}` : ''}</span></div>
    <div class="teams">${teamRow(a, lead === 'b')}${teamRow(b, lead === 'a')}</div>
    ${mapStrip(m, a, b)}
    <div class="card-foot">${watch}${altStreams(rest, main)}<span class="more">Detay${icon('next')}</span></div>
  </article>`;
}

function matchRow(m, { withDate = false } = {}) {
  const [a, b] = sides(m);
  const [main] = streamsOf(m);
  const live = m.status === 'running';
  const finished = m.status === 'finished';
  const begin = Date.parse(m.begin_at);
  const until = begin - Date.now();

  let note = '';
  if (live) note = '<small class="soon">Canlı</small>';
  else if (withDate && begin) note = `<small>${esc(shortDate(begin))}</small>`;
  else if (!finished && begin && until <= 0) note = '<small class="soon">Başlamak üzere</small>';
  else if (!finished && begin && until < 86_400_000) note = `<small class="${until < 3_600_000 ? 'soon' : ''}">${esc(relative(until))}</small>`;

  const winA = finished && m.winner_id != null && m.winner_id === a.id;
  const winB = finished && m.winner_id != null && m.winner_id === b.id;
  // Dar düzende takımlar alt alta dizilir ve skor her takımın yanında (side-score) gösterilir.
  const scored = finished || live;
  const side = (t, cls, lost) => `<div class="side ${cls}${lost ? ' lose' : ''}${t.tbd ? ' tbd' : ''}">${teamEl(t, { rev: cls === 'a' })}${
    scored ? `<b class="side-score num">${esc(t.score ?? 0)}</b>` : ''}</div>`;
  const mid = scored
    ? `<div class="mid score${live ? ' live' : ''}"><span class="${winB ? 'l' : ''}">${esc(a.score ?? 0)}</span><span class="l">:</span><span class="${winA ? 'l' : ''}">${esc(b.score ?? 0)}</span></div>`
    : '<div class="mid">vs</div>';
  const tags = [m.forfeit && '<span class="tag">Hükmen</span>', m.draw && '<span class="tag">Berabere</span>'].filter(Boolean).join('');
  const action = main
    ? `<a class="stream-btn" href="${esc(main.url)}" target="_blank" rel="noopener"
         aria-label="${esc(`${a.name} - ${b.name}: ${platform(main.url)} yayınını aç (yeni sekme)`)}">${PLAY}${esc(platform(main.url))}</a>`
    : '';

  return `<article class="row${live ? ' is-live' : ''}${scored ? ' scored' : ''}">
    <a class="stretched" href="${matchHash(m.id)}" aria-label="${esc(`${a.name} - ${b.name} maç detayı`)}"></a>
    <div class="row-time">${begin ? fmtTime.format(begin) : '—'}${note}</div>
    <div class="row-match">${side(a, 'a', winB)}${mid}${side(b, 'b', winA)}</div>
    <div class="row-meta">
      <span class="league" title="${esc([m.league?.name, subtitle(m)].filter(Boolean).join(' · '))}">${logo(m.league, 'xs')}<span>${esc(m.league?.name)}${subtitle(m) ? ` · ${esc(subtitle(m))}` : ''}</span></span>
      <span class="sub">${tierBadge(m.tournament?.tier)}<span class="extra">${esc([boLabel(m), m.stage].filter(Boolean).join(' · '))}</span>${tags}</span>
    </div>
    <div class="row-action">${action}${icon('next', 'chev')}</div>
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

const dayList = items => byDay(items).map(({ title, note, list }) => `
  <section class="day">
    <h2 class="day-title">${esc(title)} <span>${note ? `${esc(note)} · ` : ''}${list.length} maç</span></h2>
    <div class="list">${list.map(m => matchRow(m)).join('')}</div>
  </section>`).join('');

function liveView(items) {
  if (!items.length) {
    const next = filterItems(state.data.upcoming)[0];
    let body = 'Canlı bir maç başladığında burada görünecek.';
    if (next) {
      const [a, b] = sides(next);
      const when = Date.parse(next.begin_at);
      body = `Sıradaki: <a href="${matchHash(next.id)}"><b>${esc(a.name)} – ${esc(b.name)}</b></a>${when ? `, ${esc(relative(when - Date.now()))}` : ''}.`;
    }
    return empty('live', 'Şu anda canlı maç yok', body);
  }
  const sorted = [...items].sort((x, y) => tierRank(x) - tierRank(y));
  return `<div class="section-head"><h1>Şu an canlı</h1><p>${items.length} maç · Maça tıkla, detayları gör</p></div>
    <div class="grid">${sorted.map(liveCard).join('')}</div>`;
}

const upcomingView = items => (items.length ? dayList(items) : empty('calendar', 'Yaklaşan maç bulunamadı'));
const resultsView = items => (items.length ? dayList(items) : empty('results', 'Sonuç bulunamadı'));

// Kısa tabloda ilk 3 ile vurgulanan takımların bir üstü ve bir altı kalır; aradaki boşluklar "⋯" olur.
function compactRows(rows, highlight) {
  const marked = new Set();
  rows.forEach((s, i) => {
    if (i < 3) marked.add(i);
    if (highlight.has(s.team?.id)) [i - 1, i, i + 1].forEach(j => j >= 0 && j < rows.length && marked.add(j));
  });
  const out = [];
  [...marked].sort((x, y) => x - y).forEach((i, k, list) => {
    if (k && i - list[k - 1] > 1) out.push(null);
    out.push(rows[i]);
  });
  if (Math.max(...marked) < rows.length - 1) out.push(null);
  return out;
}

// PandaScore'un eleme tablosu sırası turnuva sürerken güvenilir değil (ör. 0–2 elenen takım 1. sırada).
// Bu yüzden eleme tablosu bizim hesapladığımız seri skoruna göre sıralanır: önce galibiyet, sonra az mağlubiyet.
function bracketOrder(rows) {
  if (!rows.some(s => s.record)) return rows.map(s => ({ ...s, pos: s.rank }));
  const key = s => [s.record?.wins ?? -1, -(s.record?.losses ?? 99)];
  const sorted = [...rows].sort((x, y) => key(y)[0] - key(x)[0] || key(y)[1] - key(x)[1] || x.rank - y.rank);
  return sorted.map((s, i) => {
    const prev = sorted[i - 1];
    const same = prev && key(prev)[0] === key(s)[0] && key(prev)[1] === key(s)[1];
    return { ...s, pos: same ? null : i + 1 };
  }).map((s, i, list) => ({ ...s, pos: s.pos ?? list.slice(0, i).findLast(x => x.pos != null).pos }));
}

// Galibiyet sayısı yeşil, mağlubiyet sayısı kırmızı; sıfır renksiz kalır.
const wl = (n, kind) => `<span class="${n ? kind : 'zero'}">${esc(n)}</span>`;

function standingsTable(t, highlight = new Set(), compact = false) {
  const raw = t.standings ?? [];
  if (!raw.length) return empty('trophy', 'Puan tablosu henüz yok', 'Turnuva ilerledikçe sıralama burada görünecek.');
  const all = raw[0].wins == null ? bracketOrder(raw) : raw.map(s => ({ ...s, pos: s.rank }));
  const rows = compact && all.length > 10 ? compactRows(all, highlight) : all;
  const cls = s => [s.pos <= 3 && 'top', highlight.has(s.team?.id) && 'hl'].filter(Boolean).join(' ');
  const gap = cols => `<tr class="gap"><td colspan="${cols}">⋯</td></tr>`;

  // Eleme tablosu: PandaScore son maçın kazananını vermiyor; seri skoru, son ve sıradaki maç
  // veri hattında kendi maç kayıtlarımızdan hesaplanıyor.
  if (raw[0].wins == null) {
    const recent = s => {
      const r = s.recent;
      if (!r) return '<span class="muted">—</span>';
      const inner = `<span class="fp ${r.won ? 'w' : 'l'}" title="${r.won ? 'Galibiyet' : 'Mağlubiyet'}">${r.won ? 'G' : 'M'}</span>
        <span class="vs-opp">${logo(r.opp, 'sm')}<span>${esc(initials(r.opp))}</span></span><b class="num">${r.score[0]}–${r.score[1]}</b>`;
      return findMatch(r.id) ? `<a class="st-match" href="${matchHash(r.id)}">${inner}</a>` : `<span class="st-match">${inner}</span>`;
    };
    const next = s => {
      const n = s.next;
      if (!n) return '<span class="muted">—</span>';
      const when = n.live ? '<span class="result-pill live">Canlı</span>'
        : `<span class="muted num">${esc(n.at ? `${shortDate(Date.parse(n.at))} ${fmtTime.format(Date.parse(n.at))}` : '?')}</span>`;
      return `<a class="st-match" href="${matchHash(n.id)}"><span class="vs-opp">${logo(n.opp, 'sm')}<span>${esc(initials(n.opp))}</span></span>${when}</a>`;
    };
    return `<table class="standings bracket"><thead><tr><th>#</th><th class="tcol">Takım</th><th title="Bu turnuvada kazanılan – kaybedilen seri">G–M</th>
        <th class="left">Son maç</th><th class="left hide-sm">Sıradaki</th></tr></thead><tbody>
      ${rows.map(s => (s ? `<tr class="${cls(s)}"><td class="rank">${esc(s.pos)}</td>
        <td class="tcol">${teamEl(s.team, { size: 'sm' })}</td>
        <td class="num">${s.record ? `${wl(s.record.wins, 'w')}–${wl(s.record.losses, 'l')}` : '<span class="muted">—</span>'}</td>
        <td class="left">${recent(s)}</td><td class="left hide-sm">${next(s)}</td></tr>` : gap(5))).join('')}
    </tbody></table>`;
  }

  const ties = all.some(s => s.ties);
  const diff = s => {
    if (s.game_wins == null || s.game_losses == null) return '<span class="muted">—</span>';
    const d = s.game_wins - s.game_losses;
    return `<span class="${d > 0 ? 'pos' : d < 0 ? 'neg' : 'muted'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}</span>`;
  };
  return `<table class="standings"><thead><tr><th>#</th><th class="tcol">Takım</th><th class="hide-sm" title="Oynanan">O</th>
      <th title="Galibiyet">G</th><th title="Mağlubiyet">M</th>${ties ? '<th title="Beraberlik">B</th>' : ''}<th title="Harita averajı">Av.</th></tr></thead><tbody>
    ${rows.map(s => (s ? `<tr class="${cls(s)}"><td class="rank">${esc(s.pos)}</td>
      <td class="tcol">${teamEl(s.team, { size: 'sm' })}</td>
      <td class="hide-sm muted">${esc(s.total ?? s.wins + s.losses)}</td><td>${wl(s.wins, 'w')}</td><td>${wl(s.losses, 'l')}</td>
      ${ties ? `<td class="muted">${esc(s.ties ?? 0)}</td>` : ''}<td>${diff(s)}</td></tr>` : gap(ties ? 7 : 6))).join('')}
  </tbody></table>`;
}

function tournamentPanel(t) {
  const d = state.data;
  const own = m => m.tournament?.id === t.id;
  const live = d.running.filter(own);
  const next = d.upcoming.filter(own).slice(0, 6);
  const recent = d.past.filter(own).slice(0, 6);
  const dates = [t.begin_at, t.end_at].map(v => (v ? fmtShort.format(Date.parse(v)) : '?')).join(' – ');
  const list = (title, items) => (items.length
    ? `<h3>${title}</h3><div class="list">${items.map(m => matchRow(m, { withDate: true })).join('')}</div>` : '');

  return `<section class="panel">
    <div class="panel-head">${logo(t.league, 'lg')}
      <div><h2>${esc(t.league?.name ?? t.name)}</h2>
        <p><span>${esc([t.serie, t.name].filter(Boolean).join(' · '))}</span>
          <span class="num">${icon('calendar')}${esc(dates)}</span>${t.prizepool ? `<span>${icon('trophy')}${esc(prize(t.prizepool))}</span>` : ''}${tierBadge(t.tier)}</p>
      </div>
    </div>
    <h3>Puan durumu</h3>
    ${standingsTable(t)}
    ${list('Canlı', live)}${list('Sıradaki maçlar', next)}${list('Son sonuçlar', recent)}
  </section>`;
}

function tournamentsView(items) {
  if (!items.length) return empty('trophy', 'Aktif turnuva bulunamadı');
  const sorted = [...items].sort((x, y) => tierRank(x) - tierRank(y) || norm(x.league?.name).localeCompare(norm(y.league?.name), 'tr'));
  const current = sorted.find(t => t.id === state.id) ?? sorted[0];
  const label = t => [t.serie, t.name].filter(Boolean).join(' · ');

  const groups = new Map();
  for (const t of sorted) {
    const key = tierKey(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const groupTitle = key => (key === 'other' ? 'Diğer' : `${key.toUpperCase()} seviye`);
  const aside = [...groups].map(([key, list]) => `
    <div class="league-group"><h3>${esc(groupTitle(key))}</h3>
      ${list.map(t => `<a class="league-item" href="${listHash({ view: 'turnuvalar', id: t.id })}" aria-current="${t.id === current.id}">
        ${logo(t.league)}<span class="txt"><b>${esc(t.league?.name ?? t.name)}</b><small>${esc(label(t))}</small></span>${tierBadge(t.tier)}</a>`).join('')}
    </div>`).join('');
  const select = [...groups].map(([key, list]) => `<optgroup label="${esc(groupTitle(key))}">
    ${list.map(t => `<option value="${t.id}"${t.id === current.id ? ' selected' : ''}>${esc(`${t.league?.name ?? ''} — ${label(t)}`)}</option>`).join('')}
  </optgroup>`).join('');

  return `<div class="leagues">
    <aside class="league-list" aria-label="Aktif turnuvalar">${aside}</aside>
    <div class="league-main">
      <select class="league-select" id="league-select" aria-label="Turnuva seç">${select}</select>
      ${tournamentPanel(current)}
    </div>
  </div>`;
}

/* ---------- Maç detayı ---------- */
function ensureTeams(force = false) {
  if (state.teamsLoading || (state.teams && !force)) return;
  state.teamsLoading = fetch(`${TEAMS_URL}?t=${Date.now()}`, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(json => { state.teams = json; })
    .catch(err => {
      console.error('Takım verisi yüklenemedi:', err);
      state.teams ??= { teams: {}, h2h: {}, failed: true };
    })
    .finally(() => {
      state.teamsLoading = null;
      if (state.view === 'mac') render();
    });
}

const block = (iconName, title, body, note = '') =>
  `<section class="block"><h2 class="block-title">${icon(iconName)}${title}${note ? `<small>${note}</small>` : ''}</h2>${body}</section>`;
const loadingBlock = (iconName, title) => block(iconName, title, '<div class="loading sm"><span class="spinner"></span>Yükleniyor…</div>');

function heroTeam(t, info, cls, won) {
  const loc = info?.location ? `${flag(info.location)}${esc(info.location)}` : '';
  return `<div class="hero-team ${cls}${won ? ' won' : ''}">${teamEl(t, { size: 'xl', cls: 'stack' })}
    <span class="loc">${loc}</span>${won ? `<span class="win-tag">${icon('trophy')}Kazandı</span>` : ''}</div>`;
}

function hero(m, a, b, ta, tb) {
  const live = m.status === 'running';
  const finished = m.status === 'finished';
  const begin = Date.parse(m.begin_at);
  const until = begin - Date.now();
  const winA = finished && m.winner_id === a.id;
  const winB = finished && m.winner_id === b.id;
  const status = live
    ? '<span class="badge-live"><i></i>CANLI</span>'
    : finished ? `<span class="status done">${icon('results')}Bitti</span>`
    : m.status === 'canceled' ? '<span class="status">İptal</span>'
    : `<span class="status soon">${icon('clock')}${begin ? (until > 0 ? `${esc(relative(until))} başlıyor` : 'Başlamak üzere') : 'Tarih belirlenmedi'}</span>`;
  const score = live || finished
    ? `<div class="big-score num"><span class="${winB ? 'dim' : ''}">${esc(a.score ?? 0)}</span><i>:</i><span class="${winA ? 'dim' : ''}">${esc(b.score ?? 0)}</span></div>`
    : '<div class="big-score vs">VS</div>';
  const [main, ...rest] = streamsOf(m);
  const watch = main
    ? `<div class="hero-watch">
        <a class="btn primary" href="${esc(main.url)}" target="_blank" rel="noopener">${PLAY}${live ? 'Canlı izle' : 'Yayına git'} · ${esc(platform(main.url))}${main.lang ? ` ${esc(main.lang.toUpperCase())}` : ''}</a>
        ${rest.slice(0, 5).map(s => `<a class="btn${s.lang === 'tr' ? ' tr' : ''}" href="${esc(s.url)}" target="_blank" rel="noopener">${icon('tv')}${esc(platform(s.url))}${s.lang ? ` ${esc(s.lang.toUpperCase())}` : ''}</a>`).join('')}
      </div>`
    : '<div class="hero-watch"><span class="muted">Bu maç için yayın bilgisi yok.</span></div>';
  const tour = state.data.tournaments.some(t => t.id === m.tournament?.id)
    ? `<a href="${listHash({ view: 'turnuvalar', tier: 'all', id: m.tournament.id })}">${esc(m.league?.name)}</a>`
    : esc(m.league?.name);

  return `<section class="hero${live ? ' is-live' : ''}">
    <div class="hero-top">${logo(m.league, 'sm')}<span class="hero-event">${tour}${subtitle(m) ? ` · ${esc(subtitle(m))}` : ''}</span>${tierBadge(m.tournament?.tier)}</div>
    ${m.stage ? `<div class="hero-stage">${esc(m.stage)}</div>` : ''}
    <div class="hero-main">
      ${heroTeam(a, ta, 'a', winA)}
      <div class="hero-center">${status}${score}
        <span class="hero-when">${esc([boLabel(m), begin ? `${shortDate(begin)} ${fmtTime.format(begin)}` : ''].filter(Boolean).join(' · '))}</span>
      </div>
      ${heroTeam(b, tb, 'b', winB)}
    </div>
    ${watch}
  </section>`;
}

function mapsBlock(m, a, b) {
  // Başlamamış maçlarda PandaScore boş harita kayıtları döndürüyor; onları göstermeye gerek yok.
  if (!m.games?.some(g => g.status !== 'not_started')) return '';
  const rows = m.games.map(g => {
    const winner = g.winner_id == null ? null : g.winner_id === a.id ? a : g.winner_id === b.id ? b : null;
    const side = winner === a ? 'won-a' : winner === b ? 'won-b' : '';
    const pending = g.status === 'running' ? '<span class="result-pill live">Oynanıyor</span>'
      : g.status === 'finished' ? '' : '<span class="muted">Oynanmadı</span>';
    const len = g.length >= 60 ? `<span class="map-len">${icon('clock')}${Math.round(g.length / 60)} dk</span>` : '';
    return `<div class="map-row ${side}${g.status === 'running' ? ' live' : ''}">
      <span class="map-no">${icon('map')}Harita ${esc(g.position)}</span>
      <span class="map-win">${winner ? `${teamEl(winner, { size: 'sm' })}<span class="muted">kazandı</span>` : pending}</span>${len}
    </div>`;
  }).join('');
  return block('map', 'Haritalar', `<div class="map-list">${rows}</div>`, esc(boLabel(m)));
}

function compareBlock(a, b, ta, tb) {
  if (!state.teams) return loadingBlock('chart', 'Karşılaştırma');
  const sa = ta?.stats;
  const sb = tb?.stats;
  if (!sa?.played && !sb?.played) {
    return block('chart', 'Karşılaştırma', '<p class="muted pad">Bu takımlar için son dönemde maç kaydı yok.</p>');
  }
  const days = state.data.range?.days_history ?? 30;
  const pct = (x, y) => (x + y ? Math.round((x / (x + y)) * 100) : null);
  const row = (iconName, label, va, vb, show = v => v, bar = true) => {
    const has = va != null && vb != null;
    const lead = !has || va === vb ? null : va > vb ? 'a' : 'b';
    const share = has && va + vb > 0 ? Math.round((va / (va + vb)) * 100) : 50;
    return `<div class="cmp-row">
      <span class="v a${lead === 'a' ? ' lead' : ''}">${va == null ? '—' : show(va, 'a')}</span>
      <div class="cmp-mid"><span class="lbl">${icon(iconName)}${label}</span>
        ${bar ? `<div class="bar" aria-hidden="true"><i class="ba" style="width:${share}%"></i><i class="bb" style="width:${100 - share}%"></i></div>` : ''}</div>
      <span class="v b${lead === 'b' ? ' lead' : ''}">${vb == null ? '—' : show(vb, 'b')}</span>
    </div>`;
  };
  const streak = s => (s?.streak ? (s.streak.won ? s.streak.n : -s.streak.n) : null);
  const form = t => `<div class="form">${(t?.form ?? []).map(f =>
    `<span class="fp ${f.won ? 'w' : 'l'}" title="${esc(`${f.won ? 'Galibiyet' : 'Mağlubiyet'} · ${f.opp.name} ${f.score[0]}–${f.score[1]} · ${fmtShort.format(Date.parse(f.at))}`)}">${f.won ? 'G' : 'M'}</span>`).join('') || '<span class="muted">—</span>'}</div>`;

  const body = `<div class="cmp">
    <div class="cmp-head"><span class="ca">${teamEl(a, { size: 'sm' })}</span><span class="cb">${teamEl(b, { size: 'sm', rev: true })}</span></div>
    ${row('trophy', 'Galibiyet oranı', sa?.played ? pct(sa.wins, sa.losses) : null, sb?.played ? pct(sb.wins, sb.losses) : null, v => `${v}%`)}
    ${row('target', 'Galibiyet – Mağlubiyet', sa?.played ? sa.wins : null, sb?.played ? sb.wins : null,
      (v, side) => { const s = side === 'a' ? sa : sb; return `${s.wins}–${s.losses}`; })}
    ${row('percent', 'Harita kazanma', sa?.played ? pct(sa.map_wins, sa.map_losses) : null, sb?.played ? pct(sb.map_wins, sb.map_losses) : null,
      (v, side) => { const s = side === 'a' ? sa : sb; return `${v}%<small>${s.map_wins}–${s.map_losses}</small>`; })}
    ${row('flame', 'Seri', streak(sa), streak(sb), v => (v > 0 ? `<span class="pos">${v} G</span>` : `<span class="neg">${-v} M</span>`), false)}
    ${row('calendar', 'Oynanan maç', sa?.played ?? null, sb?.played ?? null)}
    <div class="cmp-row form-row">${form(ta)}<span class="lbl">${icon('history')}Son 5 maç</span>${form(tb)}</div>
  </div>`;
  return block('chart', 'Karşılaştırma', body, `Son ${days} gün`);
}

function h2hBlock(m, a, b) {
  if (!state.teams) return loadingBlock('swords', 'Aralarındaki maçlar');
  if (a.id == null || b.id == null) return '';
  const days = state.data.range?.days_history ?? 30;
  const list = (state.teams.h2h?.[pairKey(a.id, b.id)] ?? []).filter(x => x.id !== m.id);
  if (!list.length) return block('swords', 'Aralarındaki maçlar', `<p class="muted pad">Son ${days} günde karşılaşmadılar.</p>`);
  const aw = list.filter(x => x.winner_id === a.id).length;
  const bw = list.filter(x => x.winner_id === b.id).length;
  const rows = list.slice(0, 5).map(x => {
    const linked = state.data.past.some(p => p.id === x.id);
    const sa = x.scores[a.id] ?? 0;
    const sb = x.scores[b.id] ?? 0;
    const inner = `<time>${esc(fmtShort.format(Date.parse(x.at)))}</time><span class="ev">${esc(x.event ?? '')}</span>
      <span class="sc num"><b class="${x.winner_id === a.id ? '' : 'dim'}">${sa}</b>–<b class="${x.winner_id === b.id ? '' : 'dim'}">${sb}</b></span>`;
    return linked ? `<a class="h2h-row" href="${matchHash(x.id)}">${inner}</a>` : `<div class="h2h-row">${inner}</div>`;
  }).join('');
  const body = `<div class="h2h-sum">${logo(a)}<span class="num"><b class="${aw >= bw ? '' : 'dim'}">${aw}</b><i>–</i><b class="${bw >= aw ? '' : 'dim'}">${bw}</b></span>${logo(b)}</div>
    <div class="h2h-list">${rows}</div>`;
  return block('swords', 'Aralarındaki maçlar', body, `Son ${days} gün · ${list.length} maç`);
}

function rosterList(t, info) {
  const players = info?.players ?? [];
  const items = players.length
    ? players.map(p => {
      const url = safeUrl(p.liquipedia);
      const nick = url
        ? `<a class="p-nick" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(`${p.name} · Liquipedia`)}">${esc(p.name)}</a>`
        : `<span class="p-nick">${esc(p.name)}</span>`;
      const real = [p.first_name, p.last_name].filter(Boolean).join(' ');
      return `<li class="player">${logo(p, 'pl')}<div class="p-txt">${nick}<small>${flag(p.nationality)}${esc(real)}</small></div>${p.role ? `<span class="role" lang="en">${esc(p.role)}</span>` : ''}</li>`;
    }).join('')
    : '<li class="muted pad">Kadro bilgisi yok.</li>';
  return `<div class="roster"><div class="roster-head">${teamEl(t, { size: 'sm' })}</div><ul>${items}</ul></div>`;
}

function rostersBlock(a, b, ta, tb) {
  if (!state.teams) return loadingBlock('users', 'Kadrolar');
  if (a.tbd && b.tbd) return '';
  return block('users', 'Kadrolar', `<div class="rosters">${rosterList(a, ta)}${rosterList(b, tb)}</div>`);
}

function recentList(t, info) {
  const form = info?.form ?? [];
  const items = form.length
    ? form.map(f => {
      const linked = state.data.past.some(p => p.id === f.id);
      const inner = `<span class="fp ${f.won ? 'w' : 'l'}">${f.won ? 'G' : 'M'}</span>${logo(f.opp, 'sm')}<span class="opp">${esc(f.opp.name)}</span>
        <span class="sc num">${f.score[0]}–${f.score[1]}</span><time>${esc(fmtShort.format(Date.parse(f.at)))}</time>`;
      return linked ? `<li><a href="${matchHash(f.id)}">${inner}</a></li>` : `<li><div>${inner}</div></li>`;
    }).join('')
    : '<li class="muted pad">Kayıt yok.</li>';
  return `<div class="recent"><div class="roster-head">${teamEl(t, { size: 'sm' })}</div><ul>${items}</ul></div>`;
}

function recentBlock(a, b, ta, tb) {
  if (!state.teams) return loadingBlock('history', 'Son maçlar');
  if (a.tbd && b.tbd) return '';
  return block('history', 'Son maçlar', `<div class="recents">${recentList(a, ta)}${recentList(b, tb)}</div>`);
}

function standingBlock(m, a, b) {
  const t = state.data.tournaments.find(x => x.id === m.tournament?.id);
  if (!t?.standings?.length) return '';
  const ids = new Set([a.id, b.id].filter(id => id != null));
  const link = `<a class="more-link" href="${listHash({ view: 'turnuvalar', tier: 'all', id: t.id })}">Tüm turnuva${icon('next')}</a>`;
  return block('list', 'Puan durumu', standingsTable(t, ids, true) + link, esc(t.name));
}

function matchView(id) {
  const m = findMatch(id);
  const back = `<a class="back" href="${esc(state.listHash)}">${icon('back')}Geri</a>`;
  if (!m) return `<div class="detail">${back}${empty('error', 'Maç bulunamadı', 'Bu maç artık listede değil.')}</div>`;
  ensureTeams();
  const [a, b] = sides(m);
  const ta = state.teams?.teams?.[a.id];
  const tb = state.teams?.teams?.[b.id];
  document.title = `${a.name} vs ${b.name} — CS2 Esports Center`;
  return `<div class="detail">
    ${back}
    ${hero(m, a, b, ta, tb)}
    <div class="detail-cols">
      <div class="col">${mapsBlock(m, a, b)}${compareBlock(a, b, ta, tb)}${rostersBlock(a, b, ta, tb)}${recentBlock(a, b, ta, tb)}</div>
      <div class="col">${h2hBlock(m, a, b)}${standingBlock(m, a, b)}</div>
    </div>
  </div>`;
}

/* ---------- Yönlendirme ve çizim ---------- */
function listHash(patch = {}) {
  const next = { view: LIST_VIEWS.includes(state.view) ? state.view : 'canli', tier: state.tier, id: null, ...patch };
  let hash = `#/${next.view}`;
  if (next.tier !== 'all' || next.id) hash += `/${next.tier}`;
  if (next.view === 'turnuvalar' && next.id) hash += `/${next.id}`;
  return hash;
}

function parseHash() {
  const [v, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (v === 'mac') return { view: 'mac', id: Number(a) || null };
  return {
    view: LIST_VIEWS.includes(v) ? v : null,
    tier: a && (a === 'all' || TIERS.some(([key]) => key === a)) ? a : 'all',
    id: b ? Number(b) : null,
  };
}

function go(patch) {
  const hash = listHash(patch);
  if (location.hash === hash) render();
  else location.hash = hash;
}

function renderNav() {
  const live = filterItems(state.data?.running ?? []).length;
  $('#live-count').textContent = live || '';
  document.body.classList.toggle('has-live', live > 0);
  const current = state.view === 'mac' ? state.listHash.replace(/^#\/?/, '').split('/')[0] : state.view;
  for (const a of document.querySelectorAll('.tabs a')) {
    a.href = listHash({ view: a.dataset.tab });
    if (a.dataset.tab === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function renderTiers(items) {
  const counts = new Map();
  for (const item of items) counts.set(tierKey(item), (counts.get(tierKey(item)) ?? 0) + 1);
  const chip = (key, text, count) =>
    `<button class="chip t-${key}" type="button" data-tier="${key}" aria-pressed="${state.tier === key}">
      ${key === 'all' ? '' : '<span class="tdot"></span>'}${esc(text)}<span class="n">${count}</span></button>`;
  $('#tiers').innerHTML = chip('all', 'Tümü', items.length) +
    TIERS.filter(([key]) => key !== 'other' || counts.get('other')).map(([key, text]) => chip(key, text, counts.get(key) ?? 0)).join('');
}

function renderFooter() {
  const d = state.data;
  if (!d) return;
  const at = Date.parse(d.generated_at);
  const source = d.demo
    ? 'Demo veri'
    : `Veri: <a href="https://pandascore.co" target="_blank" rel="noopener">PandaScore</a>
       · Takım ve oyuncu sayfaları: <a href="https://liquipedia.net/counterstrike/" target="_blank" rel="noopener">Liquipedia</a>`;
  $('#footer').innerHTML = `
    <span>${source} · Son güncelleme ${at ? `${fmtTime.format(at)} (${esc(relative(at - Date.now()))})` : '—'}</span>
    <span>Yayın bağlantıları resmi kanallara gider. CS2 Esports Center Valve ile bağlantılı değildir.</span>`;
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
  state.view ??= d.running.length ? 'canli' : 'yaklasan';
  renderNav();
  renderFooter();
  $('#filterbar').hidden = state.view === 'mac';
  const notice = d.demo
    ? `<div class="notice"><span><b>Demo veri gösteriliyor.</b> Takım, oyuncu ve turnuva adları örnektir; yayın bağlantıları gerçek kanallara gider.
        Gerçek maçlar için depoya <code>PANDASCORE_TOKEN</code> secret'ını ekleyin.</span></div>`
    : '';

  if (state.view === 'mac') {
    view.innerHTML = notice + matchView(state.id);
    return;
  }
  document.title = TITLE;
  state.listHash = location.hash.startsWith('#/') && !location.hash.startsWith('#/mac') ? location.hash : listHash();
  const source = { canli: d.running, yaklasan: d.upcoming, sonuclar: d.past, turnuvalar: d.tournaments }[state.view];
  const views = { canli: liveView, yaklasan: upcomingView, sonuclar: resultsView, turnuvalar: tournamentsView };
  renderTiers(filterItems(source, true));
  view.innerHTML = notice + views[state.view](filterItems(source));
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
    // Yeni yayın geldiyse açık maç detayının takım verisini de tazele.
    if (state.teams && state.teams.generated_at !== state.data.generated_at) ensureTeams(true);
  } catch (err) {
    console.error('Veri yüklenemedi:', err);
    state.error = err;
  }
  render();
}

/* ---------- Olaylar ---------- */
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0b0c0f' : '#f6f6f3';
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

let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value;
    if (state.view === 'mac') location.hash = state.listHash;
    else render();
  }, 120);
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    $('#search').focus();
  }
});

$('#tiers').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) go({ tier: chip.dataset.tier });
});

view.addEventListener('change', e => {
  if (e.target.id === 'league-select') go({ view: 'turnuvalar', id: Number(e.target.value) });
});

view.addEventListener('click', e => {
  if (!e.target.closest('[data-action="clear"]')) return;
  e.preventDefault();
  state.query = '';
  $('#search').value = '';
  go({ tier: 'all' });
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

// Listeye geri dönünce kalınan yere kaydır.
window.addEventListener('hashchange', e => {
  scrollMemory.set(new URL(e.oldURL).hash, window.scrollY);
  Object.assign(state, parseHash());
  render();
  window.scrollTo({ top: scrollMemory.get(location.hash) ?? 0 });
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) load();
});

// Yapışkan gün başlıkları üst barın gerçek yüksekliğine göre konumlanır.
const topbar = $('.topbar');
new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`)).observe(topbar);

Object.assign(state, parseHash());
load();
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
