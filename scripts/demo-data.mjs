// PandaScore token'ı eklenmeden önce siteyi önizleyebilmek için kurgusal veri üretir.
// Takım ve lig adları uydurmadır; yayın bağlantıları ilgili oyunların resmi kanallarıdır.

const GAMES = [
  { slug: 'league-of-legends', name: 'LoL', league: 'Pro Ligi', serie: 'Kış 2026', tournament: 'Normal Sezon', tier: 's', bo: 3,
    streams: [['https://www.twitch.tv/riotgames', 'en', true], ['https://www.youtube.com/@lolesports', 'en', false]] },
  { slug: 'cs-go', name: 'Counter-Strike 2', league: 'Masters Kupası', serie: 'Sonbahar 2026', tournament: 'Grup Aşaması', tier: 's', bo: 3,
    streams: [['https://www.twitch.tv/pgl', 'en', true], ['https://www.twitch.tv/blast', 'en', false]] },
  { slug: 'valorant', name: 'Valorant', league: 'Challengers', serie: 'Split 3 2026', tournament: 'Playoff', tier: 'a', bo: 3, bracket: true,
    streams: [['https://www.twitch.tv/valorant', 'en', true]] },
  { slug: 'dota-2', name: 'Dota 2', league: 'Pro Circuit', serie: 'Sonbahar 2026', tournament: 'Grup B', tier: 'a', bo: 3,
    streams: [['https://www.twitch.tv/esl_dota2', 'en', true]] },
  { slug: 'ow', name: 'Overwatch', league: 'Champions Serisi', serie: 'Aşama 4', tournament: 'Normal Sezon', tier: 'b', bo: 5,
    streams: [['https://www.twitch.tv/ow_esports', 'en', true]] },
  { slug: 'r6-siege', name: 'Rainbow 6 Siege', league: 'Pro League', serie: 'Aşama 3', tournament: 'Normal Sezon', tier: 'b', bo: 1,
    streams: [['https://www.twitch.tv/rainbow6', 'en', true]] },
  { slug: 'rl', name: 'Rocket League', league: 'Championship Series', serie: 'Sezon 2026', tournament: 'Bölgesel Açık', tier: 'c', bo: 5,
    streams: [['https://www.twitch.tv/rocketleague', 'en', true]] },
];

const TEAMS = [
  'Nova Esports', 'Crimson Wolves', 'Azure Dragons', 'Iron Foxes', 'Solar Kings', 'Night Owls', 'Vortex Gaming', 'Polar Bears',
  'Steel Hawks', 'Black Mamba', 'Northern Lights', 'Ember Five', 'Atlas Club', 'Red Comet', 'Silent Storm', 'Golden Lynx',
  'Phantom Unit', 'Echo Squad', 'Titan Forge', 'Blue Harbor', 'Wild Card', 'Neon Tigers', 'Cobalt Crew', 'Aurora Gaming',
  'Anka Espor', 'Bozkurt Gaming', 'Pusula', 'Kuzgun', 'Tufan Esports', 'Kartal Five', 'Lunar Tide', 'Velvet Ravens',
  'Obsidian', 'Sakura Blades', 'Frost Giants', 'Monarch', 'Rapid Pulse', 'Orbit Esports', 'Zenith', 'Hydra Six',
  'Granite Gate', 'Kestrel GG', 'Desert Eagles', 'Maple Leaf GG', 'Pulse Gaming', 'Delta Squad', 'Mavi Yıldız', 'Volkan Esports',
  'Sirius', 'Karayel', 'Poyraz', 'Aslan Five', 'Fırtına GG', 'Yakamoz', 'Ateş Kuşu', 'Demir Yumruk',
];

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

const acronym = name => name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4).padEnd(2, name[1].toUpperCase());
const iso = ms => new Date(ms).toISOString();
const halfHour = ms => Math.round(ms / (30 * 60_000)) * 30 * 60_000;

export function buildDemoData(now = Date.now()) {
  const rand = rng(20261104);
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const dayStart = Math.floor(now / DAY) * DAY;
  let matchId = 1000;
  let teamId = 1;
  let pool = 0;
  const running = [], upcoming = [], past = [], tournaments = [];

  GAMES.forEach((g, gi) => {
    const teams = Array.from({ length: 8 }, () => {
      const name = TEAMS[pool++ % TEAMS.length];
      return { id: teamId++, name, acronym: acronym(name), image: null, image_dark: null };
    });
    const league = { id: 100 + gi, name: g.league, image: null };
    const tournament = { id: 500 + gi, name: g.tournament, tier: g.tier };
    const streams = g.streams.map(([url, lang, main]) => ({ url, lang, official: true, main }));
    const win = Math.ceil(g.bo / 2);
    const pair = () => {
      const a = int(0, teams.length - 1);
      const b = (a + int(1, teams.length - 1)) % teams.length;
      return [teams[a], teams[b]];
    };
    const make = (status, begin, [a, b] = [], scores = []) => ({
      id: matchId++,
      status,
      begin_at: iso(begin),
      end_at: status === 'finished' ? iso(begin + g.bo * 40 * 60_000) : null,
      bo: g.bo,
      type: 'best_of',
      game: { slug: g.slug, name: g.name },
      league,
      serie: g.serie,
      tournament,
      teams: [a, b].filter(Boolean).map((t, i) => ({ ...t, score: scores[i] ?? null })),
      winner_id: status === 'finished' ? (scores[0] > scores[1] ? a.id : b.id) : null,
      draw: false,
      forfeit: false,
      streams,
    });

    const records = new Map(teams.map(t => [t.id, { team: t, wins: 0, losses: 0, game_wins: 0, game_losses: 0, last: null }]));
    for (let i = 0; i < 12; i++) {
      let begin = halfHour(dayStart - int(0, 6) * DAY + int(9, 19) * HOUR);
      if (begin > now - 3 * HOUR) begin -= DAY;
      const teamsAB = pair();
      const loser = int(0, win - 1);
      const scores = rand() < 0.5 ? [win, loser] : [loser, win];
      const m = make('finished', begin, teamsAB, scores);
      past.push(m);
      teamsAB.forEach((t, side) => {
        const r = records.get(t.id);
        const won = m.winner_id === t.id;
        r.wins += won; r.losses += !won;
        r.game_wins += scores[side]; r.game_losses += scores[1 - side];
        if (!r.last || begin > Date.parse(r.last.begin_at)) r.last = { status: 'finished', winner_id: m.winner_id, begin_at: m.begin_at };
      });
    }

    if (gi < 5) {
      running.push(make('running', now - int(15, 75) * 60_000, pair(), [int(0, win - 1), int(0, win - 1)]));
    }

    for (let i = 0; i < 10; i++) {
      let begin = i === 0 && gi === 0
        ? halfHour(now + 40 * 60_000)
        : halfHour(dayStart + int(0, 6) * DAY + int(9, 19) * HOUR);
      if (begin < now + 15 * 60_000) begin += DAY;
      upcoming.push(make('not_started', begin, g.bracket && i === 9 ? [] : pair()));
    }

    const standings = [...records.values()]
      .sort((a, b) => b.wins - a.wins || (b.game_wins - b.game_losses) - (a.game_wins - a.game_losses))
      .map((r, i) => g.bracket
        ? { rank: i + 1, team: r.team, last_match: r.last }
        : { rank: i + 1, team: r.team, wins: r.wins, losses: r.losses, ties: null, total: r.wins + r.losses,
            game_wins: r.game_wins, game_losses: r.game_losses, last_match: null });

    tournaments.push({
      id: tournament.id,
      name: g.tournament,
      tier: g.tier,
      begin_at: iso(dayStart - 10 * DAY),
      end_at: iso(dayStart + 20 * DAY),
      region: null,
      prizepool: gi < 2 ? `${(gi + 1) * 250000} United States Dollar` : null,
      has_bracket: Boolean(g.bracket),
      game: { slug: g.slug, name: g.name },
      league,
      serie: g.serie,
      standings,
    });
  });

  const byTime = (a, b) => Date.parse(a.begin_at) - Date.parse(b.begin_at);
  return {
    generated_at: iso(now),
    demo: true,
    source: 'Demo',
    range: { days_back: 7, days_ahead: 7 },
    running: running.sort(byTime),
    upcoming: upcoming.sort(byTime),
    past: past.sort((a, b) => byTime(b, a)),
    tournaments,
  };
}
