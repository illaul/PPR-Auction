/**
 * Talking to ESPN through the dev server's /espn proxy.
 *
 * ESPN publishes no API for fantasy; these two views are the ones the site
 * itself uses, and they are theirs to change. Everything here fails loudly with
 * a readable reason rather than returning half a board.
 */
import type { RawProjection } from "../state/projections";

const BASE = "/espn/apis/v3/games/ffl/seasons";

/** ESPN position ids. */
const POSITION: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };

const TEAM: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

/**
 * ESPN stat id → the stat line the model scores. Unverified against a live
 * pull; `sampleStats()` returns the raw object from the last fetch so the ids
 * can be re-read from a real response.
 */
const STAT: Record<string, string> = {
  "0": "passAtt", "1": "cmp", "3": "passYds", "4": "passTD", "20": "int",
  "23": "rushAtt", "24": "rushYds", "25": "rushTD",
  "53": "rec", "42": "recYds", "43": "recTD",
  "72": "fum",
};

let lastSample: unknown = null;
/** What did the stat ids actually look like on the last pull? */
export const sampleStats = () => lastSample;

export interface EspnPlayer {
  espnId: number;
  name: string;
  pos: string;
}

export interface EspnPick {
  espnId: number;
  teamId: number;
  price: number;
  overall: number;
}

export interface EspnDraft {
  inProgress: boolean;
  complete: boolean;
  picks: EspnPick[];
  teams: { id: number; name: string }[];
}

async function get(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw new Error("Couldn't reach ESPN. Is the dev server running (it carries the proxy)?");
  }
  if (res.status === 401) throw new Error("ESPN says not authorised — a private league needs ESPN_S2 and SWID in app/.env.local.");
  if (!res.ok) throw new Error(`ESPN answered ${res.status}.`);
  const body = await res.json();
  if (typeof body !== "object" || body === null) throw new Error("ESPN sent something that isn't JSON.");
  return body;
}

/** The whole player universe with season projections, from ESPN's public PPR defaults. */
export async function fetchPlayers(season: number, limit = 700): Promise<{ players: EspnPlayer[]; projections: RawProjection[] }> {
  const filter = JSON.stringify({
    players: { limit, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" } },
  });
  const body = await get(
    `${BASE}/${season}/segments/0/leaguedefaults/3?view=kona_player_info&x-fantasy-filter=${encodeURIComponent(filter)}`,
  ) as { players?: { player?: EspnRawPlayer }[] };

  const rows = body.players ?? [];
  if (!rows.length) throw new Error("ESPN returned no players.");

  const players: EspnPlayer[] = [];
  const projections: RawProjection[] = [];
  for (const entry of rows) {
    const p = entry.player;
    const pos = p ? POSITION[p.defaultPositionId] : undefined;
    if (!p?.fullName || !pos) continue;
    players.push({ espnId: p.id, name: p.fullName, pos });

    const proj = projectionFor(p, season);
    if (!proj) continue;
    if (lastSample === null) lastSample = { name: p.fullName, pos, stats: proj.stats };
    projections.push({
      name: p.fullName,
      pos,
      team: TEAM[p.proTeamId] ?? null,
      stats: pos === "K" || pos === "DEF" ? undefined : toStatLine(proj.stats),
      fpts: typeof proj.appliedTotal === "number" ? round1(proj.appliedTotal) : undefined,
    });
  }
  return { players, projections };
}

/** Completed auction picks, plus the league's team names. */
export async function fetchDraft(season: number, leagueId: string): Promise<EspnDraft> {
  const body = await get(
    `${BASE}/${season}/segments/0/leagues/${leagueId}?view=mDraftDetail&view=mTeam`,
  ) as {
    draftDetail?: { inProgress?: boolean; drafted?: boolean; picks?: EspnRawPick[] };
    teams?: EspnRawTeam[];
  };
  const detail = body.draftDetail;
  if (!detail) throw new Error("That league has no draft on it — check the league id.");
  return {
    inProgress: Boolean(detail.inProgress),
    complete: Boolean(detail.drafted) && !detail.inProgress,
    picks: (detail.picks ?? [])
      .filter((p) => typeof p.playerId === "number")
      .map((p) => ({
        espnId: p.playerId,
        teamId: p.teamId,
        price: typeof p.bidAmount === "number" ? p.bidAmount : 0,
        overall: p.overallPickNumber ?? 0,
      })),
    teams: (body.teams ?? []).map((t) => ({ id: t.id, name: teamName(t) })),
  };
}

/** A league URL, a bare id, or nothing. */
export function parseLeagueId(input: string): string | null {
  const byParam = input.match(/leagueId=(\d+)/i);
  if (byParam) return byParam[1];
  const bare = input.trim().match(/^(\d{3,})$/);
  return bare ? bare[1] : null;
}

interface EspnRawPlayer {
  id: number;
  fullName: string;
  defaultPositionId: number;
  proTeamId: number;
  stats?: { seasonId: number; statSourceId: number; statSplitTypeId: number; appliedTotal?: number; stats?: Record<string, number> }[];
}
interface EspnRawPick { playerId: number; teamId: number; bidAmount?: number; overallPickNumber?: number }
interface EspnRawTeam { id: number; name?: string; location?: string; nickname?: string; abbrev?: string }

function teamName(t: EspnRawTeam): string {
  if (t.name) return t.name;
  const joined = [t.location, t.nickname].filter(Boolean).join(" ").trim();
  return joined || t.abbrev || `Team ${t.id}`;
}

/** Source 1 is projected; split 0 is the whole season. */
function projectionFor(p: EspnRawPlayer, season: number) {
  const rows = p.stats ?? [];
  return rows.find((s) => s.seasonId === season && s.statSourceId === 1 && (s.statSplitTypeId === 0 || s.statSplitTypeId === 1))
    ?? rows.find((s) => s.statSourceId === 1)
    ?? null;
}

function toStatLine(raw: Record<string, number> | undefined) {
  const out: Record<string, number> = {};
  for (const [id, key] of Object.entries(STAT)) {
    const v = raw?.[id];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = round1(v);
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
