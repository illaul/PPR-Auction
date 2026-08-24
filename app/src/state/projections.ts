/**
 * Refreshing the projections the whole model sits on.
 *
 * A refresh replaces stat lines, not prices: new numbers go in, the engine
 * re-derives baselines, VBD, tiers and dollars from them. Market values and any
 * draft in progress survive it — a mid-draft refresh must not lose the draft.
 */
import type { Player, Position, StatLine } from "../engine/valuation";
import { makeResolver } from "./names.ts";

const KEY = "deflator.projections.v1";
const SEASON_MIN = 100;

export type ProjectionSource = "bundled" | "espn" | "file";

export interface ProjectionSet {
  fetchedAt: string;
  source: ProjectionSource;
  players: Player[];
}

/** What a source hands us: a name, a position, and whatever stats it has. */
export interface RawProjection {
  name: string;
  pos: string;
  team?: string | null;
  bye?: number | null;
  stats?: Partial<StatLine>;
  fpts?: number;
}

export interface MergeReport {
  players: Player[];
  updated: number;
  added: number;
  unmatched: string[];
}

const ZERO: StatLine = {
  passAtt: 0, cmp: 0, passYds: 0, passTD: 0, int: 0,
  rushAtt: 0, rushYds: 0, rushTD: 0, rec: 0, recYds: 0, recTD: 0, fum: 0,
};

/** Merge fresh projections onto the pool, keeping ids, market values and byes we already have. */
export function mergeProjections(base: Player[], incoming: RawProjection[]): MergeReport {
  const resolve = makeResolver(base);
  const byId = new Map(base.map((p) => [p.id, { ...p }]));
  const unmatched: string[] = [];
  let updated = 0;
  let added = 0;

  for (const raw of incoming) {
    const pos = normPos(raw.pos);
    if (!pos) continue;
    const id = resolve(raw.name, raw.pos);
    if (id && byId.has(id)) {
      const p = byId.get(id)!;
      byId.set(id, {
        ...p,
        team: raw.team ?? p.team,
        bye: raw.bye ?? p.bye,
        stats: raw.stats ? { ...ZERO, ...raw.stats } : p.stats,
        fpts: raw.fpts ?? p.fpts,
      });
      updated += 1;
    } else {
      unmatched.push(raw.name);
      byId.set(slug(raw.name), {
        id: slug(raw.name),
        name: raw.name,
        pos,
        team: raw.team ?? null,
        bye: raw.bye ?? null,
        stats: pos === "K" || pos === "DEF" ? null : { ...ZERO, ...(raw.stats ?? {}) },
        fpts: raw.fpts,
        market: { yahoo: 0, espn: 0, nffc: 0 },
      });
      added += 1;
    }
  }
  return { players: [...byId.values()], updated, added, unmatched };
}

/**
 * Refuse a set that would poison the board. A refresh that silently loads
 * zeroes or half a pool is worse than no refresh at all — the prices would
 * still look authoritative.
 */
export function validate(players: Player[]): string | null {
  const withStats = players.filter((p) => p.stats);
  if (withStats.length < SEASON_MIN) {
    return `only ${withStats.length} players carried stats — expected at least ${SEASON_MIN}`;
  }
  const top = (pos: Position, pick: (s: StatLine) => number) =>
    Math.max(0, ...players.filter((p) => p.pos === pos && p.stats).map((p) => pick(p.stats!)));

  const checks: [string, number, number, number][] = [
    ["passing yards for the top QB", top("QB", (s) => s.passYds), 2500, 6500],
    ["rushing yards for the top RB", top("RB", (s) => s.rushYds), 600, 2500],
    ["receptions for the top WR", top("WR", (s) => s.rec), 40, 200],
    ["receptions for the top TE", top("TE", (s) => s.rec), 20, 180],
  ];
  for (const [what, value, lo, hi] of checks) {
    if (value < lo || value > hi) return `${what} came back as ${Math.round(value)} — outside ${lo}–${hi}`;
  }
  return null;
}

export function loadStored(): ProjectionSet | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const set = JSON.parse(raw) as ProjectionSet;
    return Array.isArray(set?.players) && set.players.length ? set : null;
  } catch {
    return null;
  }
}

export function store(set: ProjectionSet): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(set));
  } catch {
    // Out of quota or a private window: the refresh still applies for this session.
  }
}

export function clearStored(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clean up */ }
}

/** "Updated 2 hours ago" beats a timestamp nobody reads. */
export function freshness(iso: string | null): string {
  if (!iso) return "bundled projections";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "bundled projections";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `updated ${hrs}h ago`;
  return `updated ${Math.round(hrs / 24)}d ago`;
}

function normPos(pos: string): Position | null {
  const p = pos.toUpperCase().replace(/[^A-Z/]/g, "");
  if (p.startsWith("QB")) return "QB";
  if (p.startsWith("RB")) return "RB";
  if (p.startsWith("WR")) return "WR";
  if (p.startsWith("TE")) return "TE";
  if (p === "K" || p === "PK") return "K";
  if (p.includes("DST") || p.includes("D/ST") || p === "DEF") return "DEF";
  return null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
