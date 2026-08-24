/**
 * Answers one question: will ESPN talk to us about your league?
 *
 *   node tools/check-espn.mjs 1184402
 *
 * Reads app/.env.local itself, so it tells you whether the cookies are being
 * picked up before you go looking anywhere else.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../app/.env.local", import.meta.url));
const leagueId = process.argv[2];
const season = Number(process.argv[3] ?? seasonNow());

if (!leagueId) {
  console.error("usage: node tools/check-espn.mjs <leagueId> [season]");
  process.exit(2);
}

const env = readEnv(envPath);
const cookie = cookieFrom(env.ESPN_S2, env.SWID);

console.log(`league ${leagueId} · season ${season}`);
console.log(cookie
  ? `cookies    found in app/.env.local (espn_s2 ${env.ESPN_S2.trim().length} chars, SWID ${short(env.SWID)})`
  : "cookies    NOT found in app/.env.local — private leagues will 401");

const origin = env.ESPN_ORIGIN ?? process.env.ESPN_ORIGIN ?? "https://lm-api-reads.fantasy.espn.com";
const url = `${origin}/apis/v3/games/ffl/seasons/${season}`
  + `/segments/0/leagues/${leagueId}?view=mDraftDetail&view=mTeam`;

try {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (res.status === 401) {
    console.log("result     401 — ESPN rejected the cookies.");
    console.log(cookie
      ? "           They are stale or from a different account. Grab them again from a\n"
        + "           logged-in fantasy.espn.com tab: DevTools → Application → Cookies."
      : "           Add ESPN_S2 and SWID to app/.env.local, then run this again.");
    process.exit(1);
  }
  if (res.status === 404) {
    console.log(`result     404 — no league ${leagueId} in ${season}. Check the id and the season.`);
    process.exit(1);
  }
  if (!res.ok) {
    console.log(`result     ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const body = await res.json();
  const picks = body?.draftDetail?.picks?.length ?? 0;
  const teams = body?.teams?.length ?? 0;
  console.log(`result     OK — ${teams} teams, ${picks} picks recorded`);
  console.log(`draft      ${body?.draftDetail?.inProgress ? "in progress" : body?.draftDetail?.drafted ? "complete" : "not started"}`);
  console.log("\nGood to go: restart `npm run dev` and pick ESPN live on the board.");
} catch (err) {
  console.log(`result     could not reach ESPN — ${err.message}`);
  process.exit(1);
}

function readEnv(path) {
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { return {}; }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function cookieFrom(s2, swid) {
  if (!s2?.trim() || !swid?.trim()) return null;
  let id = swid.trim();
  if (!id.startsWith("{")) id = `{${id.replace(/^\{|\}$/g, "")}}`;
  return `espn_s2=${s2.trim()}; SWID=${id}`;
}

function short(v) {
  const t = (v ?? "").trim();
  return t.length > 12 ? `${t.slice(0, 6)}…${t.slice(-4)}` : t;
}

/** ESPN's fantasy season rolls over in the spring. */
function seasonNow() {
  const now = new Date();
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
