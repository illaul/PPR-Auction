/** node --experimental-strip-types src/state/projections.check.ts */
import { readFileSync } from "node:fs";
import { mergeProjections, validate, freshness, type RawProjection } from "./projections.ts";
import { priceBoard, type League, type Player } from "../engine/valuation.ts";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../../data/${f}`, import.meta.url), "utf8"));
const base = read("players.json") as Player[];
const league = read("league.json") as League;

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
};

// A pull that names players the way ESPN does.
const pull: RawProjection[] = [
  { name: "Kyle Pitts", pos: "TE", team: "ATL", stats: { rec: 90, recYds: 1000, recTD: 8, fum: 1 } },
  { name: "James Cook", pos: "RB", team: "BUF", stats: { rushAtt: 240, rushYds: 1150, rushTD: 11, rec: 40, recYds: 300, recTD: 2, fum: 1 } },
  { name: "Ja'Marr Chase", pos: "WR", team: "CIN", stats: { rec: 120, recYds: 1600, recTD: 12, fum: 1 } },
  { name: "Some Rookie Nobody Has", pos: "WR", team: "SEA", stats: { rec: 40, recYds: 500, recTD: 3 } },
];

const merged = mergeProjections(base, pull);
check("known names update in place", merged.updated === 3, `${merged.updated} updated`);
check("an unknown name is added, not dropped", merged.added === 1, merged.unmatched.join(", "));
check("the pool keeps its size plus the newcomer", merged.players.length === base.length + 1,
  `${base.length} → ${merged.players.length}`);

const pitts = merged.players.find((p) => p.id === "kyle-pitts-sr")!;
check("suffixed names are matched", pitts.stats?.recYds === 1000, `recYds ${pitts.stats?.recYds}`);
const chase = merged.players.find((p) => p.id === "ja-marr-chase")!;
check("market values survive a refresh", (chase.market?.yahoo ?? 0) > 0, `yahoo $${chase.market?.yahoo}`);

// Rankings actually move.
const before = priceBoard(base, league);
const after = priceBoard(merged.players, league);
const rankOf = (b: typeof before, id: string) => b.players.find((p) => p.id === id)!.posRank;
check("a big projection bump re-ranks the player",
  rankOf(after, "kyle-pitts-sr") < rankOf(before, "kyle-pitts-sr"),
  `TE${rankOf(before, "kyle-pitts-sr")} → TE${rankOf(after, "kyle-pitts-sr")}`);
check("the pool still balances to the budget after a refresh",
  Math.abs(after.players.reduce((s, p) => s + Math.max(p.price, 0), 0) - league.budget * league.teams) < 0.01);

// The gate.
check("the bundled pool passes validation", validate(base) === null, validate(base) ?? "");
check("a half-empty pull is refused", validate(base.slice(0, 40)) !== null);
check("zeroed stats are refused",
  validate(base.map((p) => ({ ...p, stats: p.stats ? { ...p.stats, passYds: 0, rushYds: 0, rec: 0 } : null }))) !== null);
check("absurd passing yards are refused",
  validate(base.map((p) => (p.pos === "QB" && p.stats ? { ...p, stats: { ...p.stats, passYds: p.stats.passYds * 4 } } : p))) !== null);

check("freshness reads as a person would", freshness(null) === "bundled projections"
  && freshness(new Date(Date.now() - 3 * 3600_000).toISOString()) === "updated 3h ago",
  freshness(new Date(Date.now() - 3 * 3600_000).toISOString()));

console.log(failed === 0 ? "\nall refresh checks passed" : `\n${failed} refresh check(s) failed`);
process.exit(failed ? 1 : 0);
