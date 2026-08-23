/**
 * Auction valuation engine — the Deflators workbook's model, reimplemented.
 *
 * Prices come from a bilinear VBD curve: each position gets two baselines (the
 * last player the league starts, and the last it rosters), a player is measured
 * against both, and the two gaps are bought at two different rates. Above the
 * starter baseline the bench term is constant, so price is piecewise linear in
 * projected points with one kink.
 *
 * Everything here is pure. Feed it a player pool and league settings; it never
 * touches the network, the DOM, or the clock.
 */

export type SkillPos = "QB" | "RB" | "WR" | "TE";
export type Position = SkillPos | "K" | "DEF";

export const SKILL: readonly SkillPos[] = ["QB", "RB", "WR", "TE"];

/** Only starting QBs exist, so no league ever rosters more than this many. */
const QB_ROSTER_CAP = 32;

export interface StatLine {
  passAtt: number; cmp: number; passYds: number; passTD: number; int: number;
  rushAtt: number; rushYds: number; rushTD: number;
  rec: number; recYds: number; recTD: number; fum: number;
}

export interface Player {
  id: string;
  name: string;
  pos: Position;
  team: string | null;
  bye: number | string | null;
  /** null for K and DEF, whose points come pre-scored from the provider. */
  stats: StatLine | null;
  fpts?: number;
  market?: { yahoo: number; espn: number; nffc: number };
}

export interface League {
  teams: number;
  budget: number;
  rosterSize: number;
  benchSize: number;
  starters: Record<"QB" | "RB" | "WR" | "TE" | "FLEX" | "K" | "DEF", number>;
  /** e.g. "WR/RB/TE" */
  flexType: string;
  /** Share of the skill-player budget assigned to starter value; rest goes to bench value. */
  starterPct: number;
  method: "Starter/Bench" | "Average VBD";
  allowNegative: boolean;
  scoring: Record<SkillPos, StatLine>;
}

export interface Baseline {
  /** Roster spots leaguewide that start this position, flex included. */
  starters: number;
  /** Roster spots leaguewide that hold this position at all. */
  rostered: number;
  /** Points scored by the last starter and the last rostered player. */
  starterFpts: number;
  rosterFpts: number;
  /** starterFpts - rosterFpts: the flat premium every startable player collects. */
  gap: number;
}

export interface Factors {
  skillDollars: number;
  starterPF: number;
  benchPF: number;
  starterBudget: number;
  benchBudget: number;
  /** Average VBD method: one flat rate for everyone. */
  totalPF: number;
}

export interface PricedPlayer extends Player {
  fpts: number;
  posRank: number;
  role: "Starter" | "Bench" | "Undrafted";
  startVBD: number;
  benchVBD: number;
  avgVBD: number;
  price: number;
}

export interface Board {
  players: PricedPlayer[];
  baselines: Record<SkillPos, Baseline>;
  factors: Factors;
}

/** Sum of a stat line against a scoring table. */
export function score(player: Player, league: League): number {
  if (!player.stats) return player.fpts ?? 0;
  const rates = league.scoring[player.pos as SkillPos];
  if (!rates) return player.fpts ?? 0;
  let total = 0;
  for (const key of Object.keys(rates) as (keyof StatLine)[]) {
    total += (player.stats[key] ?? 0) * (rates[key] ?? 0);
  }
  return round(total, 6);
}

/** Positions a flex slot can be filled from, parsed from "WR/RB/TE". */
export function flexEligible(flexType: string): SkillPos[] {
  return flexType.split("/")
    .map((p) => p.trim().toUpperCase())
    .filter((p): p is SkillPos => (SKILL as readonly string[]).includes(p));
}

/**
 * Starter counts per position, flex allocated by projected points: base slots
 * first, then the best remaining flex-eligible players take the flex spots.
 */
export function starterCounts(
  pool: { pos: Position; fpts: number }[],
  league: League,
): Record<SkillPos, number> {
  const base = {} as Record<SkillPos, number>;
  for (const pos of SKILL) base[pos] = league.starters[pos] * league.teams;

  const flexSpots = league.starters.FLEX * league.teams;
  if (flexSpots <= 0) return base;

  const eligible = new Set(flexEligible(league.flexType));
  const counts = { ...base };
  const contenders: { pos: SkillPos; fpts: number }[] = [];
  for (const pos of SKILL) {
    if (!eligible.has(pos)) continue;
    const ranked = pool.filter((p) => p.pos === pos).sort((a, b) => b.fpts - a.fpts);
    for (const p of ranked.slice(base[pos])) contenders.push({ pos, fpts: p.fpts });
  }
  contenders.sort((a, b) => b.fpts - a.fpts);
  for (const c of contenders.slice(0, flexSpots)) counts[c.pos] += 1;
  return counts;
}

/**
 * Bench spots split in proportion to starters, except QB: no league rosters
 * more than 32 of them, and the spots that cap frees up go to RB and WR.
 */
export function benchCounts(
  starters: Record<SkillPos, number>,
  league: League,
): Record<SkillPos, number> {
  const benchSpots = league.benchSize * league.teams;
  const total = SKILL.reduce((s, pos) => s + starters[pos], 0);
  const share = (pos: SkillPos) => (starters[pos] / total) * benchSpots;

  const qbWanted = share("QB");
  const capped = starters.QB + qbWanted > QB_ROSTER_CAP;
  const qb = capped ? QB_ROSTER_CAP - starters.QB : qbWanted;
  const overflow = capped ? qbWanted - qb : 0;
  const rbWrPool = starters.RB + starters.WR;

  return {
    QB: Math.round(qb),
    RB: Math.round(share("RB") + overflow * (starters.RB / rbWrPool)),
    WR: Math.round(share("WR") + overflow * (starters.WR / rbWrPool)),
    TE: Math.round(share("TE")),
  };
}

/** Price the whole pool and return it sorted by dollars, most expensive first. */
export function priceBoard(players: Player[], league: League): Board {
  const scored = players.map((p) => ({ ...p, fpts: score(p, league) }));

  const skill = scored.filter((p) => (SKILL as readonly string[]).includes(p.pos));
  const starters = starterCounts(skill as { pos: Position; fpts: number }[], league);
  const bench = benchCounts(starters, league);

  const byPos = {} as Record<SkillPos, (Player & { fpts: number })[]>;
  const baselines = {} as Record<SkillPos, Baseline>;
  for (const pos of SKILL) {
    const ranked = skill.filter((p) => p.pos === pos).sort((a, b) => b.fpts - a.fpts);
    byPos[pos] = ranked;
    const rostered = starters[pos] + bench[pos];
    const starterFpts = at(ranked, starters[pos]);
    const rosterFpts = at(ranked, rostered);
    baselines[pos] = {
      starters: starters[pos], rostered, starterFpts, rosterFpts,
      gap: round(starterFpts - rosterFpts, 6),
    };
  }

  // VBD first, so the budget can be calibrated against the totals.
  const vbd = new Map<string, { start: number; bench: number; rank: number }>();
  let starterVBD = 0;
  let benchVBD = 0;
  for (const pos of SKILL) {
    const b = baselines[pos];
    byPos[pos].forEach((p, i) => {
      const rank = i + 1;
      const start = Math.max(p.fpts - b.starterFpts, 0);
      const raw = p.fpts - b.rosterFpts;
      const benchV = league.allowNegative ? raw : Math.max(raw, 0);
      vbd.set(p.id, { start, bench: benchV, rank });
      if (start > 0) starterVBD += start;
      if (rank > b.starters && rank <= b.rostered) benchVBD += benchV;
    });
  }

  const reserved = (league.starters.K + league.starters.DEF) * league.teams;
  const skillDollars = league.budget * league.teams - reserved;
  const benchBudget = skillDollars * (1 - league.starterPct);
  const benchPF = benchBudget / benchVBD;
  // Starters also collect the flat bench premium; take it out so the two pools
  // do not double-count, which is what makes the totals land on the budget.
  const flatToStarters = SKILL.reduce(
    (s, pos) => s + baselines[pos].gap * baselines[pos].starters, 0) * benchPF;
  const starterBudget = skillDollars * league.starterPct - flatToStarters;
  const starterPF = starterBudget / starterVBD;

  let avgVBDTotal = 0;
  for (const [, v] of vbd) {
    const avg = (v.start + v.bench) / 2;
    if (avg > 0) avgVBDTotal += avg;
  }
  const totalPF = skillDollars / avgVBDTotal;
  const factors: Factors = {
    skillDollars, starterPF, benchPF, starterBudget, benchBudget, totalPF,
  };

  const flatRanks = flatPositionRanks(scored);
  const priced: PricedPlayer[] = scored.map((p) => {
    const v = vbd.get(p.id);
    if (!v) {
      // K and DEF: a flat dollar for the ones a league actually starts.
      const rank = flatRanks.get(p.id) ?? Infinity;
      const slots = league.starters[p.pos as "K" | "DEF"] * league.teams;
      return {
        ...p, posRank: rank,
        role: rank <= slots ? "Starter" : "Undrafted",
        startVBD: 0, benchVBD: 0, avgVBD: 0, price: rank <= slots ? 1 : 0,
      };
    }
    const b = baselines[p.pos as SkillPos];
    const price = league.method === "Average VBD"
      ? ((v.start + v.bench) / 2) * totalPF
      : v.start * starterPF + (v.bench - v.start) * benchPF;
    return {
      ...p,
      posRank: v.rank,
      role: v.rank <= b.starters ? "Starter" : v.rank <= b.rostered ? "Bench" : "Undrafted",
      startVBD: round(v.start, 6),
      benchVBD: round(v.bench, 6),
      avgVBD: round((v.start + v.bench) / 2, 6),
      price: round(price, 6),
    };
  });

  priced.sort((a, b) => b.price - a.price);
  return { players: priced, baselines, factors };
}

export interface Sale { playerId: string; price: number; teamId?: string }

/**
 * Money still on the table over value still on the board. Multiply any price by
 * this to get what it should cost at this moment in the draft.
 */
export function inflation(board: Board, sales: Sale[]): number {
  const sold = new Set(sales.map((s) => s.playerId));
  const spent = sales.reduce((s, x) => s + x.price, 0);
  let pool = 0;
  let left = 0;
  for (const p of board.players) {
    if (p.price <= 0) continue;
    pool += p.price;
    if (!sold.has(p.id)) left += p.price;
  }
  if (left <= 0) return 1;
  return (pool - spent) / left;
}

/** The most a team can bid and still fill every remaining slot at $1. */
export function maxBid(remainingBudget: number, filledSlots: number, league: League): number {
  return remainingBudget - (league.rosterSize - filledSlots) + 1;
}

/** Dollar drop from the best remaining player at a position to the next one. */
export function dropoff(board: Board, pos: Position, sold: Set<string>, inflate = 1) {
  const left = board.players.filter((p) => p.pos === pos && !sold.has(p.id));
  const best = left[0];
  const next = left[1];
  if (!best) return null;
  return {
    best, next,
    gap: next ? round((best.price - next.price) * inflate, 2) : round(best.price * inflate, 2),
    share: next && best.price > 0 ? round(1 - next.price / best.price, 4) : 1,
  };
}

function at(ranked: { fpts: number }[], n: number): number {
  if (ranked.length === 0) return 0;
  return ranked[Math.min(Math.max(n, 1), ranked.length) - 1].fpts;
}

function flatPositionRanks(players: { id: string; pos: Position; fpts: number }[]) {
  const ranks = new Map<string, number>();
  for (const pos of ["K", "DEF"] as const) {
    players.filter((p) => p.pos === pos)
      .sort((a, b) => b.fpts - a.fpts)
      .forEach((p, i) => ranks.set(p.id, i + 1));
  }
  return ranks;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
