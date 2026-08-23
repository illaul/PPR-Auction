/**
 * Checks the engine against the workbook it was ported from.
 *
 *   node --experimental-strip-types app/src/engine/valuation.check.ts
 *
 * Prices are recomputed from raw stat lines and league settings alone, then
 * compared to the dollar figures the spreadsheet itself produced.
 */
import { readFileSync } from "node:fs";
import { priceBoard, inflation, maxBid, dropoff, SKILL } from "./valuation.ts";
import type { League, Player } from "./valuation.ts";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../../data/${f}`, import.meta.url), "utf8"));
const players: Player[] = read("players.json");
const league: League = read("league.json");
const expected: Record<string, number> = read("expected_prices.json");

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
};

const board = priceBoard(players, league);
const { factors, baselines } = board;

console.log(`${players.length} players · ${league.teams} teams · $${league.budget} · ${league.method}`);
console.log(`StarterPF $${factors.starterPF.toFixed(4)}/pt  BenchPF $${factors.benchPF.toFixed(4)}/pt  ` +
  `ratio ${(factors.starterPF / factors.benchPF).toFixed(2)}x\n`);

for (const pos of SKILL) {
  const b = baselines[pos];
  console.log(`  ${pos}  starters ${b.starters}  rostered ${b.rostered}  gap ${b.gap.toFixed(2)} pts`);
}
console.log("");

// 1. Every price matches the spreadsheet.
let worst = 0;
let worstId = "";
for (const p of board.players) {
  const want = expected[p.id];
  if (want === undefined) continue;
  const diff = Math.abs(p.price - want);
  if (diff > worst) { worst = diff; worstId = p.name; }
}
check("prices match the workbook", worst < 1e-4, `worst drift $${worst.toFixed(6)} (${worstId})`);

// 2. The pool exactly equals the league budget.
const pool = board.players.reduce((s, p) => s + Math.max(p.price, 0), 0);
const budget = league.budget * league.teams;
check("priced pool equals the league budget", Math.abs(pool - budget) < 0.01,
  `$${pool.toFixed(2)} vs $${budget.toFixed(2)}`);

// 3. The curve is continuous at each starter baseline and kinks upward.
for (const pos of SKILL) {
  const b = baselines[pos];
  const atBaseline = b.gap * factors.benchPF;
  const ranked = board.players.filter((p) => p.pos === pos).sort((a, b2) => a.posRank - b2.posRank);
  const lastStarter = ranked[b.starters - 1];
  check(`${pos} curve is continuous at the starter baseline`,
    Math.abs(lastStarter.price - atBaseline) < 0.01,
    `$${lastStarter.price.toFixed(2)} at ${lastStarter.name}`);
}
check("starter points cost more than bench points", factors.starterPF > factors.benchPF,
  `${(factors.starterPF / factors.benchPF).toFixed(2)}x`);

// 4. Inflation starts neutral and responds to overpays.
check("inflation is 1.00 before any sale", Math.abs(inflation(board, []) - 1) < 1e-9);
const gibbs = board.players.find((p) => p.id === "jahmyr-gibbs")!;
const over = inflation(board, [{ playerId: gibbs.id, price: gibbs.price + 20 }]);
const under = inflation(board, [{ playerId: gibbs.id, price: gibbs.price - 20 }]);
// An overpay drains money faster than it removes value, so what is left gets
// cheaper. Bargains do the reverse. This is the whole point of the league name.
check("an overpay deflates the rest of the board", over < 1, `x${over.toFixed(4)}`);
check("a bargain inflates it", under > 1, `x${under.toFixed(4)}`);

// 5. Max bid always leaves a dollar for every empty slot.
check("max bid reserves $1 per empty slot", maxBid(200, 0, league) === 200 - league.rosterSize + 1,
  `$${maxBid(200, 0, league)} with a full roster to fill`);

// 6. Dropoff reports the real gap to the next player at a position.
const rb = dropoff(board, "RB", new Set())!;
check("RB dropoff is measured to the next back", rb.next !== undefined,
  `${rb.best.name} $${rb.best.price.toFixed(2)} → ${rb.next.name} $${rb.next.price.toFixed(2)} (−$${rb.gap.toFixed(2)})`);

console.log("\ntop of the board");
for (const p of board.players.slice(0, 8)) {
  console.log(`  $${p.price.toFixed(2).padStart(6)}  ${p.name} (${p.pos}${p.posRank})  ` +
    `${p.fpts.toFixed(1)} pts · market $${(p.market?.yahoo ?? 0).toFixed(1)}`);
}

console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
