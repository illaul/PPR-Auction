import { useEffect, useMemo, useState } from "react";
import type { Board, League, SkillPos } from "../engine/valuation";
import { money } from "./bits";

const LEAGUE_URL = "deflator.leagueUrl";

export default function Setup({ league, board, onLeague, onOpen }: {
  league: League;
  board: Board;
  onLeague: (l: League) => void;
  onOpen: (withDemoData: boolean) => void;
}) {
  const [url, setUrl] = useState(() => {
    try { return localStorage.getItem(LEAGUE_URL) ?? ""; } catch { return ""; }
  });
  const [saved, setSaved] = useState(false);
  const extension = useExtensionHandshake();

  const split = useMemo(() => {
    const by: Record<string, number> = {};
    let total = 0;
    for (const p of board.players) {
      if (p.price <= 0) continue;
      by[p.pos] = (by[p.pos] ?? 0) + p.price;
      total += p.price;
    }
    return (["RB", "WR", "TE", "QB"] as const).map((pos) => ({ pos, share: (by[pos] ?? 0) / total }));
  }, [board]);

  const baselines = (["RB", "WR", "QB", "TE"] as SkillPos[])
    .map((pos) => `${pos}${board.baselines[pos].starters}`).join(" ");
  const pool = board.players.reduce((s, p) => s + Math.max(p.price, 0), 0);
  const starterPct = league.starterPct;

  return (
    <div className="setup">
      <div>
        <h1>Point Deflator at your league</h1>
        <div style={{ fontSize: 13.5, color: "var(--ink-60)", marginTop: 4 }}>
          Two things: the league, and how you want to spend.
        </div>
      </div>

      <div className="setup-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="field-lab">ESPN league URL</span>
            <div className="url-row">
              <input
                className="url-in" value={url} placeholder="fantasy.espn.com/football/league?leagueId=…"
                aria-label="ESPN league URL"
                onChange={(e) => { setUrl(e.target.value); setSaved(false); }}
              />
              <button className="cta" onClick={() => {
                try { localStorage.setItem(LEAGUE_URL, url); setSaved(true); } catch { setSaved(false); }
              }}>Save</button>
            </div>
            <span className="sub">
              {saved
                ? "Saved. The extension uses it to spot your draft room tab."
                : "Settings below come from your exported projections; Refresh data at the top pulls new numbers through the extension."}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="field-lab">Imported — confirm</span>
            <div className="facts">
              <Fact l="Teams" v={String(league.teams)} />
              <Fact l="Budget" v={money(league.budget)} />
              <Fact l="Scoring" v={league.scoring.WR.rec >= 1 ? "Full PPR" : league.scoring.WR.rec > 0 ? "Half PPR" : "Standard"} />
              <Fact l="Roster" v={`${league.rosterSize} slots`} />
              <Fact l="Baselines" v={baselines} small />
              <Fact l="Pool value" v={money(pool)} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="field-lab">Starter / bench split</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--rust-deep)" }}>
                {Math.round(starterPct * 100)}% starters · {Math.round((1 - starterPct) * 100)}% bench
              </span>
            </div>
            <div className="slider-row">
              <div className="slider-fill" style={{ width: `${starterPct * 100}%` }} />
              <div className="slider-knob" style={{ left: `${starterPct * 100}%` }} />
              <input
                type="range" min={50} max={95} step={1} value={Math.round(starterPct * 100)}
                aria-label="Share of the budget assigned to starter value"
                onChange={(e) => onLeague({ ...league, starterPct: Number(e.target.value) / 100 })}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-55)" }}>
              Sets the kink: starter-grade points price at {money(board.factors.starterPF, 3)}, bench-grade at{" "}
              {money(board.factors.benchPF, 3)}.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="field-lab">Shape</span>
            <div className="seg-pill">
              <button aria-pressed={league.method === "Starter/Bench"}
                onClick={() => onLeague({ ...league, method: "Starter/Bench" })}>
                Stars and scrubs
              </button>
              <button aria-pressed={league.method === "Average VBD"}
                onClick={() => onLeague({ ...league, method: "Average VBD" })}>
                Balanced
              </button>
            </div>
            <span className="sub">
              {league.method === "Starter/Bench"
                ? "Bilinear: every point above the starter baseline costs three times more."
                : `Flat: one rate of ${money(board.factors.totalPF, 3)} per point of value, no kink.`}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className={`side-card ${extension ? "good" : "plain"}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`dot ${extension ? "live" : "off"}`} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: extension ? "var(--olive-deep)" : "var(--alarm-deep)" }}>
                {extension ? "Extension found" : "Extension not found"}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(32,30,29,0.7)" }}>
              {extension
                ? "Relaying from the draft room tab. Nothing leaves your browser."
                : "Install it to relay picks from the ESPN draft room, or run the demo auction to see the board move."}
            </div>
          </div>

          <div className="side-card plain">
            <div className="field-lab" style={{ marginBottom: 8 }}>Budget split, from your settings</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {split.map(({ pos, share }) => (
                <div key={pos} className="split-row">
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{pos}</span>
                  <div className="b"><i className={share < 0.15 ? "minor" : ""} style={{ width: `${share * 100}%` }} /></div>
                  <span style={{ fontSize: 12, fontWeight: 700, textAlign: "right" }}>{(share * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          <button className="cta block" onClick={() => onOpen(true)}>Open the board</button>
          <button className="cta block ghost" onClick={() => onOpen(false)}>Start empty — I'll enter picks</button>
        </div>
      </div>
    </div>
  );
}

/** The extension lives in another world; the only proof it is there is a reply. */
function useExtensionHandshake(): boolean {
  const [found, setFound] = useState(false);
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source === window && (ev.data as { source?: string })?.source === "deflator-extension") setFound(true);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "deflator-app", type: "hello" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return found;
}

function Fact({ l, v, small }: { l: string; v: string; small?: boolean }) {
  return (
    <div className="fact">
      <div className="l">{l}</div>
      <div className={small ? "v sm" : "v"}>{v}</div>
    </div>
  );
}
