/**
 * A stand-in for ESPN, for testing the proxy and the polling loop offline.
 *
 *   node tools/fake-espn.mjs            # serves on :4599
 *   ESPN_ORIGIN=http://localhost:4599 npm run dev
 *
 * It answers the two views the app asks for, and drips auction picks out one
 * every few seconds so the board can be watched filling up.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const players = JSON.parse(readFileSync(here("../app/data/players.json"), "utf8"));
const PORT = Number(process.env.PORT ?? 4599);
const DRIP_MS = Number(process.env.DRIP_MS ?? 4000);

const POS_ID = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 16 };
const started = Date.now();

/** Stable fake ESPN ids, and the projection shape the client expects. */
const universe = players.map((p, i) => ({
  player: {
    id: 100000 + i,
    fullName: p.name,
    defaultPositionId: POS_ID[p.pos] ?? 3,
    proTeamId: 1,
    stats: [{
      seasonId: new Date().getUTCFullYear(),
      statSourceId: 1,
      statSplitTypeId: 0,
      appliedTotal: p.fpts ?? 0,
      stats: p.stats ? {
        0: p.stats.passAtt, 1: p.stats.cmp, 3: p.stats.passYds, 4: p.stats.passTD, 20: p.stats.int,
        23: p.stats.rushAtt, 24: p.stats.rushYds, 25: p.stats.rushTD,
        53: p.stats.rec, 42: p.stats.recYds, 43: p.stats.recTD, 72: p.stats.fum,
      } : {},
    }],
  },
}));

const teams = ["Silverbacks", "Turf Wars", "Ashfall", "Long Snappers", "Red Zone Co.", "Hail Marys",
  "Bootleg", "Play Action", "Cold Fronts", "Fourth & Long", "Onside", "Deflators"]
  .map((name, i) => ({ id: i + 1, name }));

/** One more player sells every DRIP_MS. */
function picks() {
  const n = Math.min(universe.length, Math.floor((Date.now() - started) / DRIP_MS));
  return Array.from({ length: n }, (_, i) => ({
    playerId: universe[i].player.id,
    teamId: (i % teams.length) + 1,
    bidAmount: Math.max(1, Math.round((players[i].fpts ?? 40) / 6)),
    overallPickNumber: i + 1,
  }));
}

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (body) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.searchParams.getAll("view").includes("kona_player_info")) return json({ players: universe });
  if (url.searchParams.getAll("view").includes("mDraftDetail")) {
    return json({ draftDetail: { drafted: false, inProgress: true, picks: picks() }, teams });
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end('{"error":"no such view"}');
}).listen(PORT, () => console.log(`fake ESPN on http://localhost:${PORT} (a pick every ${DRIP_MS}ms)`));
