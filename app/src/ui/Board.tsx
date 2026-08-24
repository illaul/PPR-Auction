import { useEffect, useMemo, useState } from "react";
import type { View } from "../state/model";
import type { PricedPlayer } from "../engine/valuation";
import { Cap, Dot, money } from "./bits";

interface Props {
  view: View;
  drawerOpen: boolean;
  onDrawer: (open: boolean) => void;
  onPlayer: (id: string) => void;
  onSale: (playerId: string, price: number, teamId: string) => void;
  onNominate: (playerId: string, bid: number) => void;
  onBid: (bid: number) => void;
}

export default function Board({ view, drawerOpen, onDrawer, onPlayer, onSale, onNominate, onBid }: Props) {
  const { block } = view;
  const won = useRecentWin(view);
  return (
    <div className="screen">
      <TopStrip view={view} />
      {won && <WonBand view={view} sale={won} />}
      {block
        ? <BlockBand view={view} onPlayer={onPlayer} onBid={onBid} />
        : view.myTurn
          ? <NominationBand view={view} onNominate={onNominate} onPlayer={onPlayer} />
          : <IdleBand view={view} onPlayer={onPlayer} onNominate={onNominate} />}
      <div className="panels">
        <RosterPanel view={view} />
        <RemainingPanel view={view} onPlayer={onPlayer} />
        <RivalsPanel view={view} />
      </div>
      <div className="drawer-bar">
        <span className="lab">Player table</span>
        <span className="note">
          {view.left} undrafted · search, filter by position, sort by surplus
        </span>
        <button className="open" onClick={() => onDrawer(!drawerOpen)}>
          {drawerOpen ? "close drawer" : "open drawer"} ⌃T
        </button>
      </div>
      {drawerOpen && <PlayerDrawer view={view} onPlayer={onPlayer} onSale={onSale} onNominate={onNominate} />}
    </div>
  );
}

/* ── top strip ─────────────────────────────────────────────────────────── */

function TopStrip({ view }: { view: View }) {
  const filled = view.slots.filter((s) => s.player).length;
  const infl = view.inflation;
  const kind = view.connection === "live" ? "live" : view.connection === "manual" ? "mine" : "off";
  const label = view.connection === "live" ? "Live" : view.connection === "manual" ? "Manual" : "Not connected";
  return (
    <div className="strip">
      <div className="cell">
        <Dot kind={kind} />
        <span className={`status ${kind}`}>{label}</span>
        <span className="sub">
          {view.connection === "live"
            ? `ESPN · ${((view.latencyMs ?? 400) / 1000).toFixed(1)}s`
            : view.connection === "manual" ? "you are entering picks" : "last sync — never"}
        </span>
      </div>
      <div className="cell">
        <Cap>Inflation</Cap>
        <span className="big">{infl.toFixed(2)}</span>
        <span className="status" style={{ color: infl >= 1 ? "var(--olive-mid)" : "var(--alarm-deep)" }}>
          {infl >= 1 ? "+" : ""}{((infl - 1) * 100).toFixed(1)}%
        </span>
      </div>
      <div className="cell">
        <Cap>Budget left</Cap>
        <span className="big">{money(view.me.budget)}</span>
        <span className="sub">of {money(view.league.budget)}</span>
      </div>
      <div className="cell hot">
        <Cap hot>True max bid</Cap>
        <span className="big hot">{money(view.me.maxBid)}</span>
        <span className="sub" style={{ color: "rgba(140,73,26,0.7)" }}>
          {view.slots.length - filled} slots to fill
        </span>
      </div>
      <div className="cell">
        <Cap>Slots</Cap>
        <span className="slotpips">
          {view.slots.map((s) => <i key={s.key} className={s.player ? "pip on" : "pip"} />)}
        </span>
        <span className="sub">{filled}/{view.slots.length}</span>
      </div>
      <div className="cell push">
        <span className="sub">{view.gone} gone</span>
        <span style={{ color: "rgba(32,30,29,0.28)" }}>·</span>
        <span className="sub">{view.left} left</span>
      </div>
    </div>
  );
}

/* ── the block ─────────────────────────────────────────────────────────── */

function BlockBand({ view, onPlayer, onBid }: { view: View; onPlayer: (id: string) => void; onBid: (bid: number) => void }) {
  const b = view.block!;
  const p = b.player;
  const pctOf = (n: number) => `${Math.min(100, Math.max(0, (n / b.scaleMax) * 100)).toFixed(2)}%`;
  // Two labels on one bar collide when the bid closes on my value; push them apart.
  const crowded = Math.abs(b.bid - b.maxBid) / b.scaleMax < 0.16;
  const bidLabel: React.CSSProperties = crowded
    ? { left: pctOf(b.bid), transform: b.bid <= b.maxBid ? "translateX(-100%)" : "translateX(0)", paddingRight: 8, paddingLeft: 8 }
    : { left: pctOf(b.bid) };
  const alt = alternative(view, p);

  return (
    <div className="block">
      <div className="block-head">
        <div className="block-eyebrow">On the block</div>
        <button
          className="block-name"
          style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", textAlign: "left" }}
          onClick={() => onPlayer(p.id)}
        >
          {p.name}
        </button>
        <div className="tags">
          <span className="tg tg-pos">{p.pos} · {p.team}</span>
          <span className="tg tg-line">Bye {p.bye ?? "—"}</span>
          <span className="tg tg-faint">{p.pos}{p.posRank} by value</span>
        </div>
        <div className="clock">
          <span className="sub">auctioneer</span>
          <b style={{ color: b.clock <= 4 ? "var(--alarm-deep)" : "var(--ink)" }}>{b.clock}s</b>
        </div>
      </div>

      <div className="block-grid">
        <div>
          <div className="cap hot" style={{ letterSpacing: "0.16em" }}>My max bid</div>
          <div className="maxbid">
            <span className="cur">$</span>
            <span className="amt">{b.maxBid}</span>
          </div>
          <div className="maxbid-note">
            <span>model {money(p.price, 2)}</span>
            <span>× {view.inflation.toFixed(2)} inflation</span>
            <span className={b.market > b.value ? "over" : ""}>market {money(b.market)}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="readouts">
            <div className="readout">
              <Cap>Current bid</Cap>
              <div className="n">{money(b.bid)}</div>
              <div className="bid-step">
                <button onClick={() => onBid(b.bid - 1)} aria-label="Lower the bid by a dollar">−</button>
                <button onClick={() => onBid(b.bid + 1)} aria-label="Raise the bid by a dollar">+</button>
                <span className="sub">{b.bidder ?? "track it here"}</span>
              </div>
            </div>
            <div className="readout">
              <Cap>Walk away at</Cap>
              <div className="n warn">{money(b.walkAway)}</div>
              <div className="sub">one dollar past value</div>
            </div>
            <div className="readout">
              <Cap>If it sells here</Cap>
              <div className="n mute">{b.inflationIfSold.toFixed(2)}</div>
              <div className="sub">
                inflation, {b.inflationIfSold < view.inflation
                  ? `falls ${((view.inflation - b.inflationIfSold) * 100).toFixed(1)}%`
                  : `rises ${((b.inflationIfSold - view.inflation) * 100).toFixed(1)}%`}
              </div>
            </div>
          </div>

          <div className="meter-wrap">
            <div className="meter">
              <div className="good" style={{ width: pctOf(b.maxBid) }} />
              <div className="bad" style={{ left: pctOf(b.maxBid) }} />
              <div className="value" style={{ left: pctOf(b.maxBid) }} />
              <div className="value-lab" style={{ left: pctOf(b.maxBid) }}>my value {money(b.maxBid)}</div>
              <div className="mkt" style={{ left: pctOf(b.market) }} />
              <div className="mkt-lab" style={{ left: pctOf(b.market) }}>market {money(b.market)}</div>
              <div className="cursor" style={{ left: pctOf(b.bid) }} />
              <div className="cursor-lab" style={bidLabel}>bid {money(b.bid)}</div>
              <div className="end" style={{ left: 0 }}>$0</div>
              <div className="end" style={{ right: 0 }}>{money(b.scaleMax)}</div>
            </div>
          </div>
        </div>
      </div>

      {b.verdict === "bid" ? (
        <div className="verdict bid">
          <span className="call">Bid to {money(b.maxBid)}</span>
          <span className="why">
            {money(b.surplus)} of surplus at {money(b.bid)}
            {b.market > b.maxBid
              ? ` — but the market pays ${money(b.market)} for him, so expect to lose this one`
              : ` — the market has him at ${money(b.market)}, so this one is winnable`}
          </span>
          <span className="tail">
            {b.slot ? `${b.slot.label} slot · ${money(b.slot.budgeted)} budgeted` : "bench slot"}
          </span>
        </div>
      ) : (
        <div className="verdict pass">
          <span className="call">Let it go</span>
          <span className="why">
            {money(b.over)} over.{" "}
            {alt
              ? `${alt.name} at ${money(view.price(alt), 2)} is the better use of the same money.`
              : "Nothing left at this position justifies the price."}
          </span>
          <span className="tail">walk away · {money(b.walkAway)}</span>
        </div>
      )}
    </div>
  );
}

/** Type a name, put them on the block. The fastest path when nothing relays bids. */
function BlockPicker({ view, onNominate }: { view: View; onNominate: (id: string, bid: number) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    if (q.trim().length < 2) return [];
    const needle = q.toLowerCase();
    return view.board.players
      .filter((p) => !view.sold.has(p.id) && p.name.toLowerCase().includes(needle))
      .slice(0, 5);
  }, [q, view]);
  return (
    <div className="picker">
      <input
        className="url-in" placeholder="Type the player on the block…" value={q}
        aria-label="Put a player on the block" onChange={(e) => setQ(e.target.value)}
      />
      {hits.length > 0 && (
        <div className="picker-hits">
          {hits.map((p) => (
            <button key={p.id} onClick={() => { onNominate(p.id, 1); setQ(""); }}>
              <span className="nm">{p.name}</span>
              <span className="pos">{p.pos} · {p.team}</span>
              <span className="amt">{money(view.price(p), 0)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A win is worth showing for a few seconds, then it is just history. */
function useRecentWin(view: View) {
  const [shown, setShown] = useState<View["lastSale"]>(null);
  // Sales already on the board when we opened it are history, not news.
  const [seeded] = useState(() => view.lastSale?.player.id ?? null);
  const key = view.lastSale && view.lastSale.mine ? view.lastSale.player.id : null;
  useEffect(() => {
    if (!key || key === seeded || !view.lastSale?.mine) return;
    setShown(view.lastSale);
    const t = window.setTimeout(() => setShown(null), 8000);
    return () => window.clearTimeout(t);
  }, [key, seeded]);
  return shown;
}

function WonBand({ view, sale }: { view: View; sale: NonNullable<View["lastSale"]> }) {
  const surplus = view.price(sale.player) - sale.price;
  const slot = view.slots.find((s) => s.player?.id === sale.player.id);
  return (
    <div className="state-head" style={{ background: "var(--olive-soft)", borderBottom: "1px solid var(--olive-line)" }}>
      <Dot kind="live" />
      <span className="status" style={{ color: "var(--olive-deep)" }}>Won — {view.me.name}</span>
      <span className="sub" style={{ color: "var(--olive-mid)" }}>
        {sale.player.name} at {money(sale.price)} · {surplus >= 0 ? "+" : "−"}{money(Math.abs(surplus), 2)} against value
        {slot ? ` · ${slot.label} slot` : ""} · roster {view.slots.filter((s) => s.player).length}/{view.slots.length}
      </span>
      <span className="sub" style={{ marginLeft: "auto", color: "var(--olive-mid)" }}>
        every remaining price moved to {view.inflation.toFixed(2)}
      </span>
    </div>
  );
}

function NominationBand({ view, onNominate, onPlayer }: {
  view: View; onNominate: (id: string, bid: number) => void; onPlayer: (id: string) => void;
}) {
  const picks = view.nominate;
  const bargain = view.underMarket[0];
  return (
    <div className="block">
      <div className="block-head">
        <div className="block-eyebrow">Your nomination</div>
        <div className="block-name">
          {picks.length ? `Nominate ${picks[0].name}` : "Nominate anyone — the room is priced fairly"}
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: "rgba(32,30,29,0.68)", maxWidth: 620 }}>
        {picks.length
          ? `The market pays ${money(view.market(picks[0]))} for him, the model has him at ${money(view.price(picks[0]), 2)}. Put other teams' money on a player you don't want.`
          : "Nobody left is badly mispriced. Nominate a position you have already filled."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 620 }}>
        {picks.map((p, i) => (
          <div key={p.id} className="edge over" style={i === 0 ? { borderColor: "var(--rust)", background: "rgba(198,113,57,0.1)" } : undefined}>
            <button className="nm" onClick={() => onPlayer(p.id)}
              style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", textAlign: "left" }}>
              {p.name} <span>{p.pos} · {p.team}</span>
            </button>
            <span className="mk">model {money(view.price(p), 2)}</span>
            <button className="md" onClick={() => onNominate(p.id, 1)}
              style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", fontWeight: 700 }}>
              market {money(view.market(p))} · nominate
            </button>
          </div>
        ))}
      </div>
      {bargain && (
        <div style={{ fontSize: 11.5, color: "var(--ink-50)" }}>
          Never nominate {bargain.name} — he's your {money(view.price(bargain), 2)} bargain at a {money(view.market(bargain), 2)} market price.
        </div>
      )}
    </div>
  );
}

/** Best player still available who would fill the same slot, cheaper. */
function alternative(view: View, p: PricedPlayer): PricedPlayer | null {
  const takes = view.block?.slot?.takes ?? [p.pos];
  return view.board.players.find(
    (x) => !view.sold.has(x.id) && x.id !== p.id && takes.includes(x.pos) && x.price > 0,
  ) ?? null;
}

function IdleBand({ view, onPlayer, onNominate }: {
  view: View; onPlayer: (id: string) => void; onNominate: (id: string, bid: number) => void;
}) {
  const connected = view.connection === "live";
  const watch = view.board.players.filter((p) => !view.sold.has(p.id) && p.price > 0).slice(0, 3);
  return (
    <div className="block">
      <div className="block-head">
        <div className="block-eyebrow">{connected ? "Between nominations" : "Not connected"}</div>
        <div className="block-name" style={{ color: "rgba(32,30,29,0.75)" }}>
          {connected ? "Who's up?" : "Not syncing with ESPN"}
        </div>
      </div>
      <div className="block-grid">
        <div>
          <div className="maxbid idle">
            <span className="cur">$</span>
            <span className="amt">—</span>
          </div>
          <div className="maxbid-note">
            <span>
              {connected
                ? "sales arrive on their own — name whoever is up to price them"
                : "no sync, so prices are frozen at the last inflation"}
            </span>
          </div>
          <BlockPicker view={view} onNominate={onNominate} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Cap>Watchlist, priced at {view.inflation.toFixed(2)}</Cap>
          {watch.map((p) => (
            <button key={p.id} className="watch" onClick={() => onPlayer(p.id)}
              style={{ border: 0, textAlign: "left", font: "inherit", cursor: "pointer" }}>
              <span className="n">{p.name} <span>{p.pos} · {p.team} bye {p.bye ?? "—"}</span></span>
              <span className="v">{money(p.price, 2)}</span>
              <span className="m">max {money(Math.min(Math.round(view.price(p)), view.me.maxBid))}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── panels ────────────────────────────────────────────────────────────── */

function RosterPanel({ view }: { view: View }) {
  const starters = view.slots.filter((s) => !s.bench);
  const bench = view.slots.filter((s) => s.bench);
  const benchFilled = bench.filter((s) => s.player);
  const benchBudget = bench.reduce((s, x) => s + (x.player ? 0 : x.budgeted), 0);
  return (
    <div className="panel">
      <div className="panel-head">
        <Cap>My roster</Cap>
        <span className="sub">{money(view.budgeted)} budgeted · {money(view.loose)} loose</span>
      </div>
      <div className="slots">
        {starters.map((s) => (
          <div key={s.key} className={`slot${s.player ? " filled" : ""}${s.onBlock ? " target" : ""}`}>
            <span className="k">{s.label}</span>
            <span className="who">
              {s.player ? shortName(s.player.name) : s.onBlock ? "on the block" : "open"}
            </span>
            <span className="amt">{money(s.player ? s.paid ?? 0 : s.budgeted)}</span>
          </div>
        ))}
        <div className="slot bench">
          <span className="k">BE</span>
          <span className="who">
            {benchFilled.length
              ? `${benchFilled.map((s) => `${shortName(s.player!.name)} ${money(s.paid ?? 0)}`).join(" · ")} · ${bench.length - benchFilled.length} open`
              : `${bench.length} slots open`}
          </span>
          <span className="amt">{money(benchBudget)}</span>
        </div>
      </div>
    </div>
  );
}

function RemainingPanel({ view, onPlayer }: { view: View; onPlayer: (id: string) => void }) {
  const rows = view.bestRemaining.filter(Boolean);
  const maxGap = Math.max(1, ...rows.map((r) => r!.gap));
  return (
    <div className="panel">
      <div className="panel-head">
        <Cap>Best remaining</Cap>
        <span className="sub">dropoff to next · scarcity</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => {
          const share = Math.min(1, r!.gap / maxGap);
          const steep = r!.share > 0.15;
          return (
            <button key={r!.best.id} className="rem" onClick={() => onPlayer(r!.best.id)}
              style={{ border: 0, textAlign: "left", font: "inherit", cursor: "pointer" }}>
              <span className="p">{r!.best.pos}</span>
              <span className="n">{r!.best.name}</span>
              <span className="v">{money(view.price(r!.best), 2)}</span>
              <span className="d" style={{ color: steep ? "var(--alarm-deep)" : "var(--ink-60)" }}>
                −{money(r!.gap, 1)}
              </span>
              <span className="bar">
                <i style={{ width: `${Math.max(8, share * 100)}%`, background: steep ? "var(--alarm)" : "var(--olive)" }} />
              </span>
            </button>
          );
        })}
      </div>
      <Cap>Model vs market</Cap>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {view.underMarket.slice(0, 2).map((p) => (
          <div key={p.id} className="edge under">
            <span className="nm">{p.name} <span>{p.pos}</span></span>
            <span className="mk">market {money(view.market(p), 2)}</span>
            <span className="md">model {money(view.price(p), 2)}</span>
          </div>
        ))}
        {view.overMarket.slice(0, 2).map((p) => (
          <div key={p.id} className="edge over">
            <span className="nm">{p.name} <span>{p.pos}</span></span>
            <span className="mk">market {money(view.market(p), 2)}</span>
            <span className="md">model {money(view.price(p), 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RivalsPanel({ view }: { view: View }) {
  const sorted = [...view.teams].sort((a, b) => b.maxBid - a.maxBid);
  const threat = view.block ? view.block.maxBid : 0;
  return (
    <div className="panel">
      <div className="panel-head">
        <Cap>Who can outbid me</Cap>
        <span className="sub">{view.teams.length} teams · max bid</span>
      </div>
      <div className="rivals">
        {sorted.map((t) => (
          <div key={t.id}
            className={`rival${t.isMe ? " me" : t.maxBid > threat && threat > 0 ? " threat" : ""}`}>
            <span className="nm">{t.isMe ? `Me · ${t.name}` : t.name}</span>
            <span className="amt">{money(t.maxBid)}</span>
            <span className="needs">{t.needs.length ? `needs ${t.needs.slice(0, 4).join(", ")}` : "roster full"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── drawer ────────────────────────────────────────────────────────────── */

function PlayerDrawer({ view, onPlayer, onSale, onNominate }: {
  view: View;
  onPlayer: (id: string) => void;
  onSale: (playerId: string, price: number, teamId: string) => void;
  onNominate: (playerId: string, bid: number) => void;
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [sort, setSort] = useState<"value" | "edge">("value");

  const rows = useMemo(() => {
    const edge = (p: typeof view.board.players[number]) => view.price(p) - view.market(p);
    return view.board.players
      .filter((p) => !view.sold.has(p.id))
      .filter((p) => pos === "ALL" || p.pos === pos)
      .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (sort === "value" ? b.price - a.price : edge(b) - edge(a)))
      .slice(0, 120);
  }, [view, q, pos, sort]);

  return (
    <div className="drawer">
      <div className="drawer-controls">
        <input className="url-in" style={{ maxWidth: 280 }} placeholder="Search players"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg-pill">
          {["ALL", "RB", "WR", "TE", "QB", "K", "DEF"].map((p) => (
            <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p}</button>
          ))}
        </div>
        <div className="seg-pill">
          <button aria-pressed={sort === "value"} onClick={() => setSort("value")}>By value</button>
          <button aria-pressed={sort === "edge"} onClick={() => setSort("edge")}>By surplus</button>
        </div>
      </div>
      <div className="drawer-scroll">
        <table className="ptable">
          <thead>
            <tr>
              <th>Player</th><th>Pos</th><th>Bye</th><th>Points</th>
              <th>Model</th><th>Live</th><th>Market</th><th>Surplus</th><th>Max</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const live = view.price(p);
              const mkt = view.market(p);
              const surplus = live - mkt;
              return (
                <tr key={p.id} onClick={() => onPlayer(p.id)}>
                  <td className="nm">{p.name}</td>
                  <td>{p.pos}{p.posRank}</td>
                  <td>{p.bye ?? "—"}</td>
                  <td>{p.fpts.toFixed(1)}</td>
                  <td>{money(p.price, 2)}</td>
                  <td>{money(live, 2)}</td>
                  <td>{mkt > 0 ? money(mkt, 2) : "—"}</td>
                  <td className={surplus >= 0 ? "gain" : "loss"}>
                    {surplus >= 0 ? "+" : "−"}{money(Math.abs(surplus), 2)}
                  </td>
                  <td>{money(Math.min(Math.round(live), view.me.maxBid))}</td>
                  <td>
                    <button className="pill" onClick={(e) => {
                      e.stopPropagation();
                      onNominate(p.id, 1);
                    }}>Nominate</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ManualSale view={view} onSale={onSale} />
    </div>
  );
}

function ManualSale({ view, onSale }: { view: View; onSale: (id: string, price: number, teamId: string) => void }) {
  const [price, setPrice] = useState("");
  const [teamId, setTeamId] = useState(view.teams[0].id);
  const block = view.block;
  useEffect(() => { setPrice(block ? String(block.bid) : ""); }, [block?.player.id, block?.bid]);
  if (!block) return null;
  return (
    <div className="drawer-controls" style={{ borderTop: "1px solid rgba(32,30,29,0.12)", paddingTop: 12 }}>
      <span className="lab">Record the sale</span>
      <span className="note">{block.player.name}</span>
      <input className="url-in" style={{ maxWidth: 110 }} value={price} inputMode="numeric"
        onChange={(e) => setPrice(e.target.value)} aria-label="Price paid" />
      <select className="url-in" style={{ maxWidth: 190 }} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
        {view.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button className="cta" onClick={() => onSale(block.player.id, Number(price) || block.bid, teamId)}>
        Sold
      </button>
    </div>
  );
}

function shortName(name: string) {
  const parts = name.split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}
