import type { View } from "../state/model";
import type { PricedPlayer, SkillPos } from "../engine/valuation";
import { money } from "./bits";

export default function PlayerDetail({ view, playerId, onClose }: {
  view: View; playerId: string; onClose: () => void;
}) {
  const p = view.byId.get(playerId);
  if (!p) return null;
  const live = view.price(p);
  const mkt = view.market(p);
  const base = view.board.baselines[p.pos as SkillPos];
  const next = view.board.players.find(
    (x) => x.pos === p.pos && !view.sold.has(x.id) && x.price < p.price && x.id !== p.id);
  const conflicts = view.slots
    .filter((s) => s.player && s.player.bye === p.bye)
    .map((s) => `${s.player!.name.split(" ").slice(-1)} ${s.player!.bye}`);
  const cluster = view.board.players.filter(
    (x) => x.pos === p.pos && !view.sold.has(x.id) && Math.abs(view.price(x) - live) <= 4);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <div className="detail-head">
          <div className="detail-name">{p.name}</div>
          <div className="tags">
            <span className="tg tg-pos">{p.pos} · {p.team}</span>
            <span className="tg tg-line">Bye {p.bye ?? "—"}</span>
            <span className="tg tg-faint">{p.pos}{p.posRank} by value · {p.role.toLowerCase()}</span>
          </div>
          <button className="pill" style={{ marginLeft: "auto" }} onClick={onClose}>esc to close</button>
        </div>

        <div className="detail-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="cap">Bilinear price curve — {p.pos}</span>
            <div className="curve-frame">
              {base ? <Curve view={view} player={p} /> : <FlatNote />}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Stat l="Projected points" v={p.fpts.toFixed(1)} />
            {base && <Stat l={`VBD over ${p.pos}${base.starters}`} v={p.startVBD.toFixed(1)} />}
            <Stat l="Model value" v={money(p.price, 2)} accent />
            <Stat l={`Live at ${view.inflation.toFixed(2)}`} v={money(live, 2)} accent />
            <Stat
              l="Market value"
              v={mkt > 0 ? `${money(mkt)} · ${live > 0 ? `${mkt > live ? "+" : ""}${(((mkt - live) / live) * 100).toFixed(0)}%` : "—"}` : "no market price"}
              tone={mkt > live ? "warn" : undefined}
            />
            <Stat
              l={`Dropoff to next ${p.pos}`}
              v={next ? `−${money(live - view.price(next), 2)}` : "nothing behind him"}
            />
            <Stat
              l="Bye conflicts"
              v={conflicts.length ? conflicts.join(", ") : "none on your roster"}
              tone={conflicts.length ? "warn" : "good"}
            />
            <div className="note-box">
              {cluster.length > 2
                ? `Flat tier: ${cluster.length} ${p.pos}s sit within $4 of this price. Paying market here buys no separation.`
                : `Sharp edge: nobody else at ${p.pos} is within $4 of this price.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ l, v, accent, tone }: { l: string; v: string; accent?: boolean; tone?: "warn" | "good" }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ""}`}>
      <span className="l">{l}</span>
      <span className="v" style={accent ? { color: "var(--rust-deep)" } : undefined}>{v}</span>
    </div>
  );
}

function FlatNote() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 13, color: "var(--ink-55)" }}>
      Kickers and defenses are priced flat at $1 — the model spends nothing here.
    </div>
  );
}

/** The real curve for this position, with the player marked on it. */
function Curve({ view, player }: { view: View; player: PricedPlayer }) {
  const pos = player.pos as SkillPos;
  const base = view.board.baselines[pos];
  const f = view.board.factors;
  const pool = view.board.players.filter((x) => x.pos === pos);
  const maxF = Math.max(...pool.map((x) => x.fpts));
  const minF = base.rosterFpts;
  const priceAt = (fpts: number) => {
    const start = Math.max(fpts - base.starterFpts, 0);
    const bench = fpts - base.rosterFpts;
    return start * f.starterPF + (bench - start) * f.benchPF;
  };
  const W = 560, H = 200;
  const maxP = priceAt(maxF);
  const X = (fpts: number) => ((fpts - minF) / (maxF - minF)) * W;
  const Y = (price: number) => H - (price / maxP) * (H - 12);

  const kinkX = X(base.starterFpts);
  const px = X(player.fpts);
  const py = Y(player.price);
  const mkt = view.market(player);

  return (
    <svg viewBox="0 0 560 236" style={{ width: "100%", height: "100%", overflow: "visible" }}>
      <line x1="0" y1={H} x2={W} y2={H} stroke="rgba(32,30,29,0.18)" strokeWidth="1" />
      <line x1="0" y1="0" x2="0" y2={H} stroke="rgba(32,30,29,0.18)" strokeWidth="1" />
      <line x1={kinkX} y1="0" x2={kinkX} y2={H} stroke="rgba(32,30,29,0.2)" strokeWidth="1" strokeDasharray="4 4" />
      <path
        d={`M0 ${Y(0)} L${kinkX} ${Y(priceAt(base.starterFpts))} L${W} ${Y(maxP)}`}
        fill="none" stroke="#c67139" strokeWidth="3" strokeLinejoin="round"
      />
      {pool.filter((x) => x.price > 0).map((x) => (
        <circle
          key={x.id} cx={X(x.fpts)} cy={Y(x.price)} r={view.sold.has(x.id) ? 2.5 : 3.5}
          fill={view.sold.has(x.id) ? "rgba(32,30,29,0.28)" : "#8c491a"}
          fillOpacity={view.sold.has(x.id) ? 0.5 : 0.85}
        />
      ))}
      <text x={kinkX + 4} y="14" fontFamily="Figtree" fontSize="11" fill="rgba(32,30,29,0.55)">
        starter baseline {pos}{base.starters}
      </text>
      <text x={W} y="34" textAnchor="end" fontFamily="Figtree" fontSize="11" fill="rgba(32,30,29,0.55)">
        ${f.starterPF.toFixed(3)} / pt — starter grade
      </text>
      <text x="6" y={H - 12} fontFamily="Figtree" fontSize="11" fill="rgba(32,30,29,0.55)">
        ${f.benchPF.toFixed(3)} / pt — bench grade
      </text>
      <text x="6" y={H - 28} fontFamily="Figtree" fontSize="10.5" fill="rgba(32,30,29,0.4)">
        filled dots are still on the board
      </text>
      <circle cx={px} cy={py} r="7" fill="#8f3325" />
      <circle cx={px} cy={py} r="13" fill="none" stroke="#8f3325" strokeWidth="1.5" opacity="0.45" />
      <text x={px + 16} y={py - 4} fontFamily="Figtree" fontSize="12" fontWeight="700" fill="#8f3325">
        {player.name.split(" ").slice(-1)} — model {money(player.price, 2)}
      </text>
      {mkt > 0 && mkt <= maxP && (
        <>
          <circle cx={px} cy={Y(mkt)} r="5" fill="rgba(32,30,29,0.4)" />
          <text x={px + 14} y={Y(mkt) - 3} fontFamily="Figtree" fontSize="11.5" fill="rgba(32,30,29,0.55)">
            market {money(mkt)}
          </text>
        </>
      )}
      <text x="0" y="222" fontFamily="Figtree" fontSize="11" fill="rgba(32,30,29,0.45)">projected points →</text>
    </svg>
  );
}
