/** node --experimental-strip-types src/state/names.check.ts */
import { readFileSync } from "node:fs";
import { makeResolver } from "./names.ts";
import type { Player } from "../engine/valuation.ts";

const players = JSON.parse(
  readFileSync(new URL("../../data/players.json", import.meta.url), "utf8")) as Player[];
const resolve = makeResolver(players);

const cases: [string, string | null, string?][] = [
  ["CeeDee Lamb", "ceedee-lamb"],
  ["Kyle Pitts", "kyle-pitts-sr"],
  ["Kyle Pitts Sr.", "kyle-pitts-sr"],
  ["James Cook", "james-cook-iii"],
  ["Ja'Marr Chase", "ja-marr-chase"],
  ["Amon-Ra St. Brown", "amon-ra-st-brown"],
  ["JAHMYR GIBBS", "jahmyr-gibbs"],
  ["Houston Texans", "houston-texans"],
  ["Texans", "houston-texans"],
  ["Houston D/ST", "houston-texans"],
  ["Some Guy Who Retired", null],
  // Listed at two positions in the source data: the position breaks the tie.
  ["Connor Heyward", null],
  ["Connor Heyward", "connor-heyward", "RB"],
  ["Connor Heyward", "connor-heyward-te", "TE"],
];

const ids = new Set(players.map((p) => p.id));
if (ids.size !== players.length) {
  console.log(`FAIL  every player has a unique id — ${players.length} players, ${ids.size} ids`);
  process.exit(1);
}
console.log(`  ok  every player has a unique id (${ids.size})`);

let failed = 0;
for (const [input, want, meta] of cases) {
  const got = resolve(input, meta);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${input.padEnd(24)} → ${got ?? "no match"}${ok ? "" : `  (wanted ${want ?? "no match"})`}`);
}
console.log(failed === 0 ? "\nall name cases passed" : `\n${failed} name case(s) failed`);
process.exit(failed ? 1 : 0);
