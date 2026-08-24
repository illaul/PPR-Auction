/** App-level state: the priced board, the draft in progress, and everything derived from them. */
import {
  priceBoard, inflation, maxBid as trueMaxBid, dropoff,
  type Board, type League, type Player, type PricedPlayer, type Sale, type Position,
} from "../engine/valuation";
import playerData from "../../data/players.json";
import leagueData from "../../data/league.json";

export const PLAYERS = playerData as unknown as Player[];
export const DEFAULT_LEAGUE = leagueData as unknown as League;

export type Connection = "live" | "manual" | "disconnected";

export interface Team {
  id: string;
  name: string;
  isMe: boolean;
}

export interface Block {
  playerId: string;
  bid: number;
  bidder: string | null;
  clock: number;
}

export interface DraftState {
  teams: Team[];
  sales: (Sale & { teamId: string })[];
  block: Block | null;
  connection: Connection;
  latencyMs: number | null;
  /** ESPN says it is our turn to put a player up. */
  myTurn: boolean;
  /** Last sync failure, shown until the next good poll. */
  error: string | null;
}

export const DEFAULT_TEAMS: Team[] = [
  "Deflators", "Silverbacks", "Turf Wars", "Ashfall", "Long Snappers", "Red Zone Co.",
  "Hail Marys", "Bootleg", "Play Action", "Cold Fronts", "Fourth & Long", "Onside",
].map((name, i) => ({ id: `t${i}`, name, isMe: i === 0 }));

/* ── roster shape ─────────────────────────────────────────────────────── */

export interface Slot {
  key: string;
  label: string;
  /** Positions that can fill it. */
  takes: Position[];
  bench: boolean;
}

export function slotsFor(league: League): Slot[] {
  const out: Slot[] = [];
  const add = (label: string, takes: Position[], bench = false) =>
    out.push({ key: label, label, takes, bench });
  for (let i = 0; i < league.starters.QB; i++) add(league.starters.QB > 1 ? `QB${i + 1}` : "QB", ["QB"]);
  for (let i = 0; i < league.starters.RB; i++) add(`RB${i + 1}`, ["RB"]);
  for (let i = 0; i < league.starters.WR; i++) add(`WR${i + 1}`, ["WR"]);
  for (let i = 0; i < league.starters.TE; i++) add(league.starters.TE > 1 ? `TE${i + 1}` : "TE", ["TE"]);
  for (let i = 0; i < league.starters.FLEX; i++) {
    add(league.starters.FLEX > 1 ? `FLEX${i + 1}` : "FLEX", flexTakes(league));
  }
  for (let i = 0; i < league.starters.DEF; i++) add("D/ST", ["DEF"]);
  for (let i = 0; i < league.starters.K; i++) add("K", ["K"]);
  for (let i = 0; i < league.benchSize; i++) add(`BE${i + 1}`, ["QB", "RB", "WR", "TE", "K", "DEF"], true);
  return out;
}

function flexTakes(league: League): Position[] {
  return league.flexType.split("/").map((p) => p.trim().toUpperCase()) as Position[];
}

export interface FilledSlot extends Slot {
  player: PricedPlayer | null;
  paid: number | null;
  /** Dollars the plan sets aside for this slot, for empty ones. */
  budgeted: number;
  onBlock: boolean;
}

/* ── the derived view the whole UI reads ──────────────────────────────── */

export interface TeamView extends Team {
  spent: number;
  budget: number;
  filled: number;
  maxBid: number;
  needs: string[];
}

export interface View {
  league: League;
  connection: Connection;
  latencyMs: number | null;
  myTurn: boolean;
  lastSale: { player: PricedPlayer; price: number; mine: boolean } | null;
  board: Board;
  byId: Map<string, PricedPlayer>;
  inflation: number;
  /** Multiply any model price by this for a live price. */
  price: (p: PricedPlayer) => number;
  /** Site values scaled to this league's pool, so "market" means the same currency. */
  market: (p: PricedPlayer) => number;
  sold: Set<string>;
  teams: TeamView[];
  me: TeamView;
  slots: FilledSlot[];
  budgeted: number;
  loose: number;
  gone: number;
  left: number;
  block: BlockView | null;
  bestRemaining: ReturnType<typeof dropoff>[];
  /** Who to throw to the room: priced well above what the model says they are worth. */
  nominate: PricedPlayer[];
  underMarket: PricedPlayer[];
  overMarket: PricedPlayer[];
}

export interface BlockView {
  player: PricedPlayer;
  bid: number;
  bidder: string | null;
  clock: number;
  /** Live model price for this player. */
  value: number;
  market: number;
  /** What I should pay at most: value, capped by what my roster can afford. */
  maxBid: number;
  walkAway: number;
  surplus: number;
  over: number;
  verdict: "bid" | "pass";
  slot: FilledSlot | null;
  inflationIfSold: number;
  scaleMax: number;
}

export function buildBoard(league: League, players: Player[] = PLAYERS): Board {
  return priceBoard(players, league);
}

export function buildView(league: League, board: Board, draft: DraftState): View {
  const byId = new Map(board.players.map((p) => [p.id, p]));
  const infl = inflation(board, draft.sales);
  const sold = new Set(draft.sales.map((s) => s.playerId));

  const marketScale = scaleMarket(board);
  const price = (p: PricedPlayer) => p.price * infl;
  const market = (p: PricedPlayer) => (p.market?.yahoo ?? 0) * marketScale;

  const slotTemplate = slotsFor(league);
  const teams: TeamView[] = draft.teams.map((t) => {
    const mine = draft.sales.filter((s) => s.teamId === t.id);
    const spent = mine.reduce((s, x) => s + x.price, 0);
    const budget = league.budget - spent;
    const filled = mine.length;
    return {
      ...t, spent, budget, filled,
      maxBid: Math.max(0, trueMaxBid(budget, filled, league)),
      needs: openPositions(slotTemplate, mine, byId),
    };
  });
  const me = teams.find((t) => t.isMe) ?? teams[0];

  const mySales = draft.sales.filter((s) => s.teamId === me.id);
  const slots = fillSlots(slotTemplate, mySales, byId);
  const blockPlayer = draft.block ? byId.get(draft.block.playerId) ?? null : null;
  const targetSlot = blockPlayer ? firstOpenFor(slots, blockPlayer.pos) : null;
  if (targetSlot) targetSlot.onBlock = true;

  budgetSlots(slots, me.budget, board, sold, price, blockPlayer?.id);
  const budgeted = slots.filter((s) => !s.player).reduce((s, x) => s + x.budgeted, 0);

  const valued = board.players.filter((p) => p.price > 0);
  const gone = draft.sales.length;

  let block: BlockView | null = null;
  if (draft.block && blockPlayer) {
    const value = price(blockPlayer);
    const cap = Math.min(Math.round(value), me.maxBid);
    const bid = draft.block.bid;
    const ifSold = inflation(board, [...draft.sales, { playerId: blockPlayer.id, price: bid }]);
    block = {
      player: blockPlayer,
      bid,
      bidder: draft.block.bidder,
      clock: draft.block.clock,
      value,
      market: market(blockPlayer),
      maxBid: cap,
      walkAway: cap + 1,
      surplus: Math.max(0, cap - bid),
      over: Math.max(0, bid - cap),
      verdict: bid <= cap ? "bid" : "pass",
      slot: targetSlot,
      inflationIfSold: ifSold,
      scaleMax: Math.max(80, Math.ceil(Math.max(value, market(blockPlayer), bid) * 1.25 / 10) * 10),
    };
  }

  const liveEdge = (p: PricedPlayer) => price(p) - market(p);
  // Cents-level disagreements at the bottom of the pool are noise, not an edge.
  const contenders = valued.filter(
    (p) => !sold.has(p.id) && p.id !== draft.block?.playerId
      && (p.market?.yahoo ?? 0) > 0 && (price(p) >= 3 || market(p) >= 3));

  const blocked = new Set(sold);
  if (draft.block) blocked.add(draft.block.playerId);

  const last = draft.sales.at(-1);
  const lastPlayer = last ? byId.get(last.playerId) : undefined;

  return {
    league, board, byId, inflation: infl, price, market, sold, teams, me, slots,
    connection: draft.connection,
    latencyMs: draft.latencyMs,
    myTurn: draft.myTurn,
    lastSale: last && lastPlayer
      ? { player: lastPlayer, price: last.price, mine: last.teamId === me.id }
      : null,
    budgeted, loose: Math.max(0, me.budget - budgeted),
    gone, left: valued.length - gone,
    block,
    bestRemaining: (["RB", "WR", "TE", "QB"] as Position[]).map((pos) => dropoff(board, pos, blocked, infl)),
    underMarket: [...contenders].sort((a, b) => liveEdge(b) - liveEdge(a)).slice(0, 6),
    overMarket: [...contenders].sort((a, b) => liveEdge(a) - liveEdge(b)).slice(0, 6),
    nominate: [...contenders]
      .filter((p) => market(p) > price(p) * 1.15)
      .sort((a, b) => (market(b) - price(b)) - (market(a) - price(a)))
      .slice(0, 3),
  };
}

/** Site dollars are published for a different pool size; put them in our currency. */
export function scaleMarket(board: Board): number {
  let ours = 0;
  let theirs = 0;
  for (const p of board.players) {
    if (p.price <= 0) continue;
    const m = p.market?.yahoo ?? 0;
    if (m <= 0) continue;
    ours += p.price;
    theirs += m;
  }
  return theirs > 0 ? ours / theirs : 1;
}

function fillSlots(
  template: Slot[],
  sales: (Sale & { teamId: string })[],
  byId: Map<string, PricedPlayer>,
): FilledSlot[] {
  const slots: FilledSlot[] = template.map((s) => ({ ...s, player: null, paid: null, budgeted: 0, onBlock: false }));
  for (const sale of sales) {
    const p = byId.get(sale.playerId);
    if (!p) continue;
    const slot = firstOpenFor(slots, p.pos);
    if (slot) { slot.player = p; slot.paid = sale.price; }
  }
  return slots;
}

function firstOpenFor(slots: FilledSlot[], pos: Position): FilledSlot | null {
  return slots.find((s) => !s.player && !s.onBlock && s.takes.includes(pos))
    ?? slots.find((s) => !s.player && s.takes.includes(pos))
    ?? null;
}

function openPositions(
  template: Slot[],
  sales: (Sale & { teamId: string })[],
  byId: Map<string, PricedPlayer>,
): string[] {
  const slots = fillSlots(template, sales, byId);
  return slots.filter((s) => !s.player && !s.bench).map((s) => s.label.replace(/\d+$/, ""));
}

/**
 * Spread what is left across the slots still to fill, in proportion to what the
 * best player available for each slot actually costs right now. Bench slots
 * never get more than a token, so the plan does not strand money there.
 */
function budgetSlots(
  slots: FilledSlot[],
  budget: number,
  board: Board,
  sold: Set<string>,
  price: (p: PricedPlayer) => number,
  blockId?: string,
) {
  const open = slots.filter((s) => !s.player);
  if (open.length === 0 || budget <= 0) return;
  const bestFor = (s: FilledSlot) => {
    const p = board.players.find(
      (x) => !sold.has(x.id) && x.id !== blockId && s.takes.includes(x.pos) && x.price > 0);
    return p ? Math.max(price(p), 1) : 1;
  };
  const weights = open.map((s) => (s.bench ? 1 : bestFor(s)));
  const total = weights.reduce((a, b) => a + b, 0);
  const reserve = open.length; // a dollar per slot must survive
  const spendable = Math.max(0, budget - reserve);
  open.forEach((s, i) => { s.budgeted = 1 + Math.round((spendable * weights[i]) / total); });
}

export { makeResolver } from "./names";
