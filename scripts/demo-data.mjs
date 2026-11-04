// PandaScore token'ı eklenmeden önce siteyi önizleyebilmek için kurgusal CS2 verisi üretir.
// Takım, oyuncu ve turnuva adları uydurmadır; yayın bağlantıları gerçek CS2 yayın kanallarıdır.

const TOURNAMENTS = [
  { league: 'Masters Kupası', serie: 'Sonbahar 2026', name: 'Grup Aşaması', tier: 's', bo: 3, prize: '1000000 United States Dollar',
    streams: [['https://www.twitch.tv/pgl', 'en', true], ['https://www.youtube.com/@PGLCS', 'en', false]] },
  { league: 'Pro Ligi', serie: 'Sezon 24', name: 'Normal Sezon', tier: 'a', bo: 3, prize: '250000 United States Dollar',
    streams: [['https://www.twitch.tv/blast', 'en', true]] },
  { league: 'Challengers Serisi', serie: 'Avrupa 2026', name: 'Playoff', tier: 'b', bo: 3, bracket: true, prize: null,
    streams: [['https://www.twitch.tv/pgl', 'en', true]] },
];

const STAGES = ['Grup A, 1. tur', 'Grup B, 2. tur', 'Üst grup yarı finali', 'Alt grup çeyrek finali', 'Çeyrek final', 'Yarı final', 'Final'];

const TEAMS = [
  ['Nova Esports', 'NOVA', 'DK'], ['Crimson Wolves', 'CW', 'SE'], ['Azure Dragons', 'AZD', 'FR'], ['Iron Foxes', 'IRF', 'DE'],
  ['Anka Espor', 'ANKA', 'TR'], ['Steel Hawks', 'SHK', 'PL'], ['Northern Lights', 'NL', 'FI'], ['Red Comet', 'RC', 'UA'],
  ['Atlas Club', 'ATL', 'US'], ['Golden Lynx', 'GLX', 'BR'], ['Phantom Unit', 'PHU', 'EE'], ['Bozkurt Gaming', 'BZK', 'TR'],
  ['Titan Forge', 'TTN', 'CZ'], ['Blue Harbor', 'BH', 'PT'], ['Echo Squad', 'ECO', 'KZ'], ['Silent Storm', 'SST', 'MN'],
];

const NICK_START = ['ar', 'bel', 'cor', 'dex', 'el', 'fyn', 'gri', 'hak', 'isk', 'jol', 'kry', 'lum', 'mav', 'nyx', 'or', 'pyk',
  'riz', 'sab', 'tav', 'umb', 'vex', 'wyl', 'xan', 'yuk', 'zar', 'kai', 'sev', 'ton', 'bra', 'qwe'];
const NICK_END = ['', 'o', 'ix', 'en', 'y', 'ek', 'ro', 'zz', 'a', '1', 'k', 'th'];
const FIRST = ['Mads', 'Erik', 'Lucas', 'Jonas', 'Emre', 'Kacper', 'Mikko', 'Oleksii', 'Tyler', 'Gabriel', 'Karl', 'Kaan',
  'Tomas', 'Rui', 'Arman', 'Bat', 'Viktor', 'Noah', 'Mert', 'Felix', 'Hugo', 'Oskar', 'Daniel', 'Bora'];
const LAST = ['Jensen', 'Lindqvist', 'Moreau', 'Becker', 'Yıldız', 'Nowak', 'Virtanen', 'Kovalenko', 'Brooks', 'Silva',
  'Tamm', 'Aydın', 'Novak', 'Costa', 'Sadykov', 'Erdene', 'Holm', 'Weber', 'Demir', 'Larsen'];
const ROLES = ['IGL', 'AWP', 'Rifler', 'Rifler', 'Entry'];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = ms => new Date(ms).toISOString();
const halfHour = ms => Math.round(ms / (30 * 60_000)) * 30 * 60_000;

export function buildDemoData(now = Date.now()) {
  const rand = rng(2026);
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = list => list[int(0, list.length - 1)];
  const dayStart = Math.floor(now / DAY) * DAY;
  let matchId = 5000;
  let playerId = 900;

  const rosters = {};
  const teams = TEAMS.map(([name, acronym, location], i) => {
    const team = { id: i + 1, name, acronym, image: null, image_dark: null };
    rosters[team.id] = {
      ...team,
      location,
      players: ROLES.map(role => {
        const nick = pick(NICK_START) + pick(NICK_END);
        return {
          id: playerId++,
          name: nick[0].toUpperCase() + nick.slice(1),
          first_name: pick(FIRST),
          last_name: pick(LAST),
          nationality: rand() < 0.75 ? location : pick(['DK', 'SE', 'TR', 'DE', 'FR', 'PL', 'UA', 'BR']),
          role,
          image: null,
        };
      }),
    };
    return team;
  });

  const running = [], upcoming = [], history = [], tournaments = [];

  TOURNAMENTS.forEach((def, ti) => {
    const pool = teams.slice((ti * 5) % teams.length).concat(teams).slice(0, 8);
    const league = { id: 100 + ti, name: def.league, image: null };
    const tournament = { id: 500 + ti, name: def.name, tier: def.tier, prizepool: def.prize, region: 'EU' };
    const streams = def.streams.map(([url, lang, main]) => ({ url, lang, official: true, main }));
    const win = Math.ceil(def.bo / 2);
    const pair = () => {
      const a = int(0, pool.length - 1);
      return [pool[a], pool[(a + int(1, pool.length - 1)) % pool.length]];
    };
    // Bo3 için harita harita sonuç: kazananın win, kaybedenin lose haritası, karışık sırayla
    const mapsFor = (a, b, scores, status) => {
      const order = [];
      const left = [...scores];
      while (left[0] + left[1] > 0) {
        const side = left[0] && (!left[1] || rand() < 0.5) ? 0 : 1;
        left[side]--;
        order.push(side);
      }
      const games = order.map((side, i) => ({ position: i + 1, status: 'finished', winner_id: [a, b][side].id, length: int(1900, 3300) }));
      if (status === 'running') games.push({ position: games.length + 1, status: 'running', winner_id: null, length: null });
      while (games.length < def.bo) games.push({ position: games.length + 1, status: 'not_started', winner_id: null, length: null });
      return games;
    };
    const make = (status, begin, [a, b] = [], scores = [null, null]) => ({
      id: matchId++,
      stage: pick(STAGES),
      status,
      begin_at: iso(begin),
      end_at: status === 'finished' ? iso(begin + def.bo * 45 * 60_000) : null,
      bo: def.bo,
      type: 'best_of',
      league,
      serie: def.serie,
      tournament,
      teams: [a, b].filter(Boolean).map((t, i) => ({ ...t, score: scores[i] })),
      winner_id: status === 'finished' ? (scores[0] > scores[1] ? a.id : b.id) : null,
      draw: false,
      forfeit: false,
      streams,
      games: a && b && status !== 'not_started' ? mapsFor(a, b, scores, status) : [],
    });

    const records = new Map(pool.map(t => [t.id, { team: t, wins: 0, losses: 0, game_wins: 0, game_losses: 0, last: null }]));
    for (let i = 0; i < 40; i++) {
      let begin = halfHour(dayStart - int(0, 29) * DAY + int(12, 20) * HOUR);
      if (begin > now - 3 * HOUR) begin -= DAY;
      const ab = pair();
      const loser = int(0, win - 1);
      const scores = rand() < 0.5 ? [win, loser] : [loser, win];
      const m = make('finished', begin, ab, scores);
      history.push(m);
      if (begin < now - 10 * DAY) continue;
      ab.forEach((t, side) => {
        const r = records.get(t.id);
        const won = m.winner_id === t.id;
        r.wins += won;
        r.losses += !won;
        r.game_wins += scores[side];
        r.game_losses += scores[1 - side];
        // Gerçek API gibi: eleme tablosunda son maçın kazananı boş gelir.
        if (!r.last || begin > Date.parse(r.last.begin_at)) r.last = { status: 'finished', winner_id: null, begin_at: m.begin_at };
      });
    }

    const live = pair();
    running.push(make('running', now - int(20, 80) * 60_000, live, [int(0, win - 1), int(0, win - 1)]));

    for (let i = 0; i < 9; i++) {
      let begin = i === 0 && ti === 0
        ? halfHour(now + 40 * 60_000)
        : halfHour(dayStart + int(0, 6) * DAY + int(12, 20) * HOUR);
      if (begin < now + 15 * 60_000) begin += DAY;
      upcoming.push(make('not_started', begin, def.bracket && i === 8 ? [] : pair()));
    }

    const standings = [...records.values()]
      .sort((a, b) => b.wins - a.wins || (b.game_wins - b.game_losses) - (a.game_wins - a.game_losses))
      .map((r, i) => def.bracket
        ? { rank: i + 1, team: r.team, last_match: r.last }
        : { rank: i + 1, team: r.team, wins: r.wins, losses: r.losses, ties: null, total: r.wins + r.losses,
            game_wins: r.game_wins, game_losses: r.game_losses, last_match: null });

    tournaments.push({
      id: tournament.id,
      name: def.name,
      tier: def.tier,
      begin_at: iso(dayStart - 12 * DAY),
      end_at: iso(dayStart + 18 * DAY),
      region: 'EU',
      prizepool: def.prize,
      has_bracket: Boolean(def.bracket),
      league,
      serie: def.serie,
      standings,
    });
  });

  const byTime = (a, b) => Date.parse(a.begin_at) - Date.parse(b.begin_at);
  return { demo: true, running: running.sort(byTime), upcoming: upcoming.sort(byTime), history, tournaments, rosters };
}
