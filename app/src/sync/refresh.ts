import type { RawProjection } from "../state/projections";

/**
 * Asks the extension for a fresh projection pull. The app never calls ESPN
 * itself — the browser would block it, and the extension is the only thing
 * here with permission to talk to them.
 */
export function refreshFromExtension(season: number, timeoutMs = 20_000): Promise<RawProjection[]> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The extension didn't answer. Is it installed and enabled?"));
    }, timeoutMs);

    function onMessage(ev: MessageEvent) {
      if (ev.source !== window) return;
      const data = ev.data as { source?: string; type?: string; players?: RawProjection[]; error?: string };
      if (data?.source !== "deflator-extension" || data.type !== "projections") return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (data.error) reject(new Error(data.error));
      else resolve(data.players ?? []);
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ source: "deflator-app", type: "refresh", season }, window.location.origin);
  });
}

/** Reads a projections file: the export this repo produces, or a plain CSV. */
export async function refreshFromFile(file: File): Promise<RawProjection[]> {
  const text = await file.text();
  if (file.name.endsWith(".json")) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.players;
    if (!Array.isArray(rows)) throw new Error("That JSON has no player array in it.");
    return rows.map((r: Record<string, unknown>) => ({
      name: String(r.name ?? r.Player ?? ""),
      pos: String(r.pos ?? r.POS ?? r.position ?? ""),
      team: (r.team as string) ?? null,
      bye: (r.bye as number) ?? null,
      stats: (r.stats as RawProjection["stats"]) ?? undefined,
      fpts: (r.fpts as number) ?? undefined,
    })).filter((r) => r.name && r.pos);
  }
  return parseCsv(text);
}

/** FantasyPros-style export: a header row, one player per line. */
function parseCsv(text: string): RawProjection[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("That file has no rows in it.");
  const head = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const idx = {
    name: col("player", "name", "playername"),
    pos: col("pos", "position"),
    team: col("team", "tm"),
    passYds: col("pass yds", "passing yds", "pass_yds"),
    passTD: col("pass tds", "passing tds", "pass_td"),
    int: col("ints", "int", "interceptions"),
    rushAtt: col("rush att", "att", "rushing att"),
    rushYds: col("rush yds", "rushing yds"),
    rushTD: col("rush tds", "rushing tds"),
    rec: col("rec", "receptions"),
    recYds: col("rec yds", "receiving yds"),
    recTD: col("rec tds", "receiving tds"),
    fum: col("fl", "fum lost", "fumbles lost"),
    fpts: col("fpts", "points"),
  };
  if (idx.name < 0 || idx.pos < 0) throw new Error("The file needs at least a player and a position column.");

  const num = (cells: string[], i: number) => (i >= 0 ? Number(cells[i]?.replace(/[^0-9.\-]/g, "")) || 0 : 0);
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    return {
      name: cells[idx.name]?.trim() ?? "",
      pos: cells[idx.pos]?.trim() ?? "",
      team: idx.team >= 0 ? cells[idx.team]?.trim() : null,
      stats: {
        passYds: num(cells, idx.passYds), passTD: num(cells, idx.passTD), int: num(cells, idx.int),
        rushAtt: num(cells, idx.rushAtt), rushYds: num(cells, idx.rushYds), rushTD: num(cells, idx.rushTD),
        rec: num(cells, idx.rec), recYds: num(cells, idx.recYds), recTD: num(cells, idx.recTD),
        fum: num(cells, idx.fum),
      },
      fpts: idx.fpts >= 0 ? num(cells, idx.fpts) : undefined,
    };
  }).filter((r) => r.name && r.pos);
}

function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if ((ch === "," || ch === "\t") && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
