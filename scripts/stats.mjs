// Maç geçmişinden takım formu, özet istatistikleri ve iki takım arasındaki maçları çıkarır.
// PandaScore'un ücretsiz planı oyuncu istatistiği vermediği için takım istatistikleri buradan gelir.

const time = m => Date.parse(m.begin_at ?? '') || 0;

export const pairKey = (x, y) => (x < y ? `${x}-${y}` : `${y}-${x}`);

// takım id → o takımın maçları (yeniden eskiye)
export function indexByTeam(history) {
  const byTeam = new Map();
  for (const m of [...history].sort((a, b) => time(b) - time(a))) {
    for (const t of m.teams) {
      if (t?.id == null) continue;
      if (!byTeam.has(t.id)) byTeam.set(t.id, []);
      byTeam.get(t.id).push(m);
    }
  }
  return byTeam;
}

export function teamSummary(teamId, matches, formSize = 5) {
  let wins = 0;
  let losses = 0;
  let mapWins = 0;
  let mapLosses = 0;
  const results = [];
  // Harita bazlı sayaçlar: [kazanılan, toplam]
  const first = [0, 0], decider = [0, 0], clean = [0, 0], comeback = [0, 0], bo1 = [0, 0], multi = [0, 0];
  const minutes = [];
  for (const m of matches) {
    const us = m.teams.find(t => t.id === teamId);
    const them = m.teams.find(t => t.id !== teamId);
    if (!us || !them || m.winner_id == null) continue;
    const won = m.winner_id === teamId;
    wins += won;
    losses += !won;
    mapWins += us.score ?? 0;
    mapLosses += them.score ?? 0;

    const games = (m.games ?? [])
      .filter(g => g.status === 'finished' && g.winner_id != null)
      .sort((x, y) => x.position - y.position);
    const tally = (counter, hit) => { counter[0] += hit; counter[1]++; };
    if (m.bo === 1) tally(bo1, won);
    else if (m.bo >= 2) tally(multi, won);
    if (games[0]) tally(first, games[0].winner_id === teamId);
    // Seri son haritaya kaldıysa (Bo3'te 3., Bo5'te 5. harita) o harita belirleyicidir.
    if (m.bo >= 3 && games.length === m.bo) tally(decider, games.at(-1).winner_id === teamId);
    // Kazanılan çok haritalı serilerden kaçı harita kaybetmeden (2–0, 3–0) geldi.
    if (m.bo >= 3 && won) tally(clean, (them.score ?? 0) === 0);
    // İlk haritası kaybedilen serilerden kaçı yine de kazanıldı.
    if (m.bo >= 3 && games[0] && games[0].winner_id !== teamId) tally(comeback, won);
    for (const g of games) if (g.length >= 60) minutes.push(g.length / 60);

    results.push({
      id: m.id,
      at: m.begin_at,
      won,
      score: [us.score ?? 0, them.score ?? 0],
      opp: { id: them.id, name: them.name, acronym: them.acronym, image: them.image, image_dark: them.image_dark },
      event: m.league?.name ?? null,
    });
  }
  let streak = null;
  if (results.length) {
    let n = 0;
    while (n < results.length && results[n].won === results[0].won) n++;
    streak = { won: results[0].won, n };
  }
  return {
    stats: {
      played: wins + losses, wins, losses, map_wins: mapWins, map_losses: mapLosses, streak,
      maps: {
        first: { w: first[0], n: first[1] },
        decider: { w: decider[0], n: decider[1] },
        clean: { w: clean[0], n: clean[1] },
        comeback: { w: comeback[0], n: comeback[1] },
        bo1: { w: bo1[0], n: bo1[1] },
        multi: { w: multi[0], n: multi[1] },
        avg_minutes: minutes.length ? Math.round(minutes.reduce((x, y) => x + y, 0) / minutes.length) : null,
        timed_maps: minutes.length,
      },
    },
    form: results.slice(0, formSize),
  };
}

// Bir turnuvadaki her takımın seri skoru, son maçı ve sıradaki maçı. PandaScore'un eleme tablosu
// son maçın kazananını boş döndürdüğü için bu bilgiler kendi maç verimizden çıkarılır.
export function tournamentRecords(tournamentId, finished, scheduled) {
  const records = new Map();
  const get = id => {
    if (!records.has(id)) records.set(id, { wins: 0, losses: 0, last: null, next: null });
    return records.get(id);
  };
  const opp = t => ({ id: t.id, name: t.name, acronym: t.acronym, image: t.image, image_dark: t.image_dark });
  const own = m => m.tournament?.id === tournamentId && m.teams.length === 2;

  for (const m of finished.filter(own).sort((a, b) => time(a) - time(b))) {
    if (m.winner_id == null) continue;
    for (const [us, them] of [m.teams, [...m.teams].reverse()]) {
      const r = get(us.id);
      const won = m.winner_id === us.id;
      r.wins += won;
      r.losses += !won;
      r.last = { id: m.id, at: m.begin_at, won, score: [us.score ?? 0, them.score ?? 0], opp: opp(them) };
    }
  }
  for (const m of scheduled.filter(own).sort((a, b) => time(a) - time(b))) {
    for (const [us, them] of [m.teams, [...m.teams].reverse()]) {
      const r = get(us.id);
      r.next ??= { id: m.id, at: m.begin_at, live: m.status === 'running', opp: opp(them) };
    }
  }
  return records;
}

// Aralarındaki maçlar listesinde tek bir karşılaşma
export const toMeeting = m => ({
  id: m.id,
  at: m.begin_at,
  winner_id: m.winner_id,
  scores: Object.fromEntries(m.teams.map(t => [t.id, t.score ?? 0])),
  event: m.league?.name ?? null,
});

// a'nın maç listesinden b ile oynadıkları (yeniden eskiye)
export function headToHead(a, b, matchesOfA, limit = 10) {
  return matchesOfA
    .filter(m => m.winner_id != null && m.teams.some(t => t.id === b))
    .slice(0, limit)
    .map(toMeeting);
}

// Önbellekteki eski karşılaşmalarla geçmişteki yenileri birleştirir; en yeni `limit` maç kalır.
export function mergeMeetings(lists, limit = 5) {
  const byId = new Map();
  for (const m of lists.flat()) if (m?.id != null && m.at) byId.set(m.id, m);
  const at = m => Date.parse(m.at) || 0;
  return [...byId.values()].sort((x, y) => at(y) - at(x)).slice(0, limit);
}
