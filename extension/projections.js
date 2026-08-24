/**
 * Pulling season projections out of ESPN.
 *
 * `leaguedefaults/3` is ESPN's public PPR default view, so this needs no login
 * and no league id — we only want the stat lines; scoring is applied by the
 * app, against your league's own settings.
 *
 * Both maps below are ESPN's to change. If a refresh comes back wrong, run
 * `__deflatorRawStats()` from the service worker console: it prints the raw
 * stats object of the highest-projected player so the ids can be re-read.
 */
const ENDPOINT = (season) =>
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`;

const FILTER = {
  players: {
    limit: 700,
    sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" },
  },
};

const POSITION = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };

const TEAM = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

/** ESPN stat id → the stat line the model scores. Verify against a live pull. */
const STAT = {
  0: "passAtt", 1: "cmp", 3: "passYds", 4: "passTD", 20: "int",
  23: "rushAtt", 24: "rushYds", 25: "rushTD",
  53: "rec", 42: "recYds", 43: "recTD",
  72: "fum",
};

let lastRaw = null;

/** Season-long projection: source 1 is projected, split 0 is the full season. */
function projectionFor(player, season) {
  const rows = player?.stats ?? [];
  return rows.find(
    (s) => s.seasonId === season && s.statSourceId === 1 && (s.statSplitTypeId === 0 || s.statSplitTypeId === 1),
  ) ?? rows.find((s) => s.statSourceId === 1) ?? null;
}

function toStatLine(raw) {
  const out = {};
  for (const [id, key] of Object.entries(STAT)) {
    const v = raw?.[id];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.round(v * 10) / 10;
  }
  return out;
}

export async function fetchProjections(season) {
  const res = await fetch(ENDPOINT(season), {
    headers: { "x-fantasy-filter": JSON.stringify(FILTER) },
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`ESPN answered ${res.status} for the ${season} projections.`);
  const body = await res.json();
  const rows = body?.players ?? [];
  if (!rows.length) throw new Error("ESPN returned no players.");

  const out = [];
  for (const entry of rows) {
    const p = entry?.player;
    const pos = POSITION[p?.defaultPositionId];
    if (!p?.fullName || !pos) continue;
    const proj = projectionFor(p, season);
    if (!proj) continue;
    if (!lastRaw) lastRaw = { name: p.fullName, pos, stats: proj.stats };
    out.push({
      name: p.fullName,
      pos,
      team: TEAM[p.proTeamId] ?? null,
      stats: pos === "K" || pos === "DEF" ? undefined : toStatLine(proj.stats),
      fpts: typeof proj.appliedTotal === "number" ? Math.round(proj.appliedTotal * 10) / 10 : undefined,
    });
  }
  if (!out.length) throw new Error("ESPN returned players, but none carried a season projection.");
  return out;
}

/** Console helper: what did the ids actually look like on the last pull? */
globalThis.__deflatorRawStats = () => lastRaw;
