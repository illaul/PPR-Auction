/** A half-finished auction, so the board can be read at a glance without a live draft. */
import type { Board, Sale } from "../engine/valuation";
import type { Team } from "./model";

export const DEMO_BLOCK = "ceedee-lamb";
const MINE = ["jahmyr-gibbs", "kyle-pitts-sr"];
/** Left unsold so the board has something worth bidding on. */
const KEEP = new Set([
  "christian-mccaffrey", "puka-nacua", "trey-mcbride", "josh-allen",
  "jonathan-taylor", "brock-bowers", "lamar-jackson", "de-von-achane",
]);

/**
 * Sells the top of the board at a small discount to model value — which is how
 * a real room behaves early, and why inflation drifts above 1.00.
 */
export function seedScenario(
  board: Board,
  teams: Team[],
  marketScale: number,
  count = 51,
  blockId = DEMO_BLOCK,
): (Sale & { teamId: string })[] {
  const me = teams.find((t) => t.isMe)!;
  const others = teams.filter((t) => !t.isMe);
  const pool = board.players.filter(
    (p) => p.price > 0 && p.id !== blockId && (!KEEP.has(p.id) || MINE.includes(p.id)));
  const sales: (Sale & { teamId: string })[] = [];
  let i = 0;
  for (const p of pool) {
    if (sales.length >= count) break;
    const mine = MINE.includes(p.id);
    const market = (p.market?.yahoo ?? 0) * marketScale;
    const paid = Math.max(1, Math.round((market > 0 ? (market + p.price) / 2 : p.price) * 0.92));
    sales.push({ playerId: p.id, price: paid, teamId: mine ? me.id : others[i++ % others.length].id });
  }
  // Round out my roster with a defense and a kicker, the way a real one fills in.
  for (const id of ["houston-texans", "brandon-aubrey"]) {
    const p = board.players.find((x) => x.id === id);
    if (p && !sales.some((s) => s.playerId === id)) {
      sales.push({ playerId: id, price: p.pos === "DEF" ? 2 : 1, teamId: me.id });
    }
  }
  return sales;
}
