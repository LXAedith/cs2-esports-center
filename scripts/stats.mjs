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
  for (const m of matches) {
    const us = m.teams.find(t => t.id === teamId);
    const them = m.teams.find(t => t.id !== teamId);
    if (!us || !them || m.winner_id == null) continue;
    const won = m.winner_id === teamId;
    wins += won;
    losses += !won;
    mapWins += us.score ?? 0;
    mapLosses += them.score ?? 0;
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
    stats: { played: wins + losses, wins, losses, map_wins: mapWins, map_losses: mapLosses, streak },
    form: results.slice(0, formSize),
  };
}

// a'nın maç listesinden b ile oynadıkları (yeniden eskiye)
export function headToHead(a, b, matchesOfA, limit = 10) {
  return matchesOfA
    .filter(m => m.winner_id != null && m.teams.some(t => t.id === b))
    .slice(0, limit)
    .map(m => ({
      id: m.id,
      at: m.begin_at,
      winner_id: m.winner_id,
      scores: Object.fromEntries(m.teams.map(t => [t.id, t.score ?? 0])),
      event: m.league?.name ?? null,
    }));
}
