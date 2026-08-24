import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  DEFAULT_LEAGUE, DEFAULT_TEAMS, PLAYERS, buildBoard, buildView, makeResolver, scaleMarket,
  type DraftState,
} from "./state/model";
import { seedScenario, DEMO_BLOCK } from "./state/seed";
import type { League } from "./engine/valuation";
import type { SyncEvent, SyncSource } from "./sync/types";
import { DemoSync } from "./sync/demo";
import { ExtensionSync } from "./sync/extension";
import { PollSync } from "./sync/poll";
import { parseLeagueId } from "./sync/espn";
import Board from "./ui/Board";
import Setup from "./ui/Setup";
import PlayerDetail from "./ui/PlayerDetail";
import RefreshData from "./ui/RefreshData";
import { clearStored, loadStored, store, type ProjectionSet } from "./state/projections";
import type { Player } from "./engine/valuation";

type Action =
  | { kind: "event"; event: SyncEvent; teamId: (name: string) => string }
  | { kind: "pickMe"; teamId: string }
  | { kind: "reset"; state: DraftState }
  | { kind: "manualSale"; playerId: string; price: number; teamId: string }
  | { kind: "nominate"; playerId: string; bid: number }
  | { kind: "setBid"; bid: number };

function reducer(state: DraftState, action: Action): DraftState {
  switch (action.kind) {
    case "reset":
      return action.state;
    case "pickMe":
      return { ...state, teams: state.teams.map((t) => ({ ...t, isMe: t.id === action.teamId })) };
    case "nominate":
      return { ...state, block: { playerId: action.playerId, bid: action.bid, bidder: null, clock: 0 } };
    case "setBid":
      return state.block ? { ...state, block: { ...state.block, bid: Math.max(0, action.bid) } } : state;
    case "manualSale":
      return {
        ...state,
        sales: [...state.sales, { playerId: action.playerId, price: action.price, teamId: action.teamId }],
        block: state.block?.playerId === action.playerId ? null : state.block,
      };
    case "event": {
      const e = action.event;
      switch (e.type) {
        case "status": {
          const latency = e.latencyMs ?? state.latencyMs;
          const settled = state.connection === e.connection
            && Math.abs((latency ?? 0) - (state.latencyMs ?? 0)) < 250;
          // Identical status every poll would re-render the board out from under a click.
          if (settled && state.error === null) return state;
          return { ...state, connection: e.connection, latencyMs: latency, error: null };
        }
        case "turn":
          return { ...state, myTurn: e.yours };
        case "error":
          return { ...state, error: e.message };
        case "teams": {
          const same = state.teams.length === e.teams.length
            && state.teams.every((t, i) => t.id === e.teams[i].id && t.name === e.teams[i].name);
          if (same) return state;
          // ESPN owns the team list once it is polling; keep whichever one is ours.
          const mine = state.teams.find((t) => t.isMe)?.name;
          const teams = e.teams.map((t, i) => ({
            id: t.id, name: t.name,
            isMe: mine ? t.name === mine : i === 0,
          }));
          return { ...state, teams: teams.some((t) => t.isMe) ? teams : teams.map((t, i) => ({ ...t, isMe: i === 0 })) };
        }
        case "nomination":
          return { ...state, block: { playerId: e.playerId, bid: e.bid, bidder: e.bidder, clock: 20 } };
        case "bid":
          return state.block ? { ...state, block: { ...state.block, bid: e.bid, bidder: e.bidder } } : state;
        case "clock":
          return state.block ? { ...state, block: { ...state.block, clock: e.seconds } } : state;
        case "sold":
          if (state.sales.some((x) => x.playerId === e.playerId)) return state;
          return {
            ...state,
            sales: [...state.sales, { playerId: e.playerId, price: e.price, teamId: action.teamId(e.teamName) }],
            block: null,
          };
      }
    }
  }
}

const SEASON = new Date().getUTCMonth() >= 2 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;

export default function App() {
  const [league, setLeague] = useState<League>(DEFAULT_LEAGUE);
  const [screen, setScreen] = useState<"setup" | "board">("setup");
  const [sourceId, setSourceId] = useState<"demo" | "poll" | "extension">("demo");
  const [leagueId, setLeagueId] = useState<string | null>(() => {
    try { return parseLeagueId(localStorage.getItem("deflator.leagueUrl") ?? ""); } catch { return null; }
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A refresh swaps the stat lines under the engine; everything downstream —
  // baselines, VBD, tiers, dollars — is re-derived, and the draft is untouched.
  const [projections, setProjections] = useState<ProjectionSet | null>(() => loadStored());
  const players: Player[] = projections?.players ?? PLAYERS;

  const board = useMemo(() => buildBoard(league, players), [league, players]);
  const marketScale = useMemo(() => scaleMarket(board), [board]);
  const resolver = useMemo(() => makeResolver(players), [players]);

  const applyProjections = (set: ProjectionSet) => { store(set); setProjections(set); };
  const resetProjections = () => { clearStored(); setProjections(null); };

  const [draft, dispatch] = useReducer(reducer, null, (): DraftState => ({
    teams: DEFAULT_TEAMS,
    sales: [],
    block: null,
    connection: "disconnected",
    latencyMs: null,
    myTurn: false,
    error: null,
  }));

  const teamIdByName = useCallback((name: string) => {
    const hit = draft.teams.find((t) => t.name.toLowerCase() === name.toLowerCase());
    return hit?.id ?? draft.teams[1].id;
  }, [draft.teams]);

  // Sync source owns the block; the reducer owns everything durable.
  const sourceRef = useRef<SyncSource | null>(null);
  useEffect(() => {
    if (screen !== "board") return;
    const emit = (event: SyncEvent) => dispatch({ kind: "event", event, teamId: teamIdByName });
    const source: SyncSource =
      sourceId === "demo"
        ? new DemoSync(board, draft.teams.filter((t) => !t.isMe).map((t) => t.name), marketScale,
            new Set(draft.sales.map((s) => s.playerId)))
        : sourceId === "poll" && leagueId
          ? new PollSync(SEASON, leagueId, resolver)
          : new ExtensionSync(resolver);
    sourceRef.current = source;
    source.start(emit);
    return () => { source.stop(); sourceRef.current = null; };
    // Restarting on every sale would reset the demo queue, so the deps stay narrow
    // on purpose: the source pushes, it never reads back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, sourceId, board, leagueId]);

  const view = useMemo(() => buildView(league, board, draft), [league, board, draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailId(null);
      if (e.key.toLowerCase() === "t" && e.ctrlKey) { e.preventDefault(); setDrawerOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openBoard = (demoData: boolean) => {
    dispatch({
      kind: "reset",
      state: {
        teams: DEFAULT_TEAMS,
        sales: demoData ? seedScenario(board, DEFAULT_TEAMS, marketScale) : [],
        block: demoData ? { playerId: DEMO_BLOCK, bid: 34, bidder: "Silverbacks", clock: 8 } : null,
        connection: demoData ? "live" : "disconnected",
        latencyMs: demoData ? 400 : null,
        myTurn: false,
        error: null,
      },
    });
    setSourceId(demoData ? "demo" : "extension");
    setScreen("board");
  };

  const header = (
    <header className="head">
      <div className="wordmark">Deflator</div>
      <RefreshData
        base={PLAYERS}
        current={projections}
        season={SEASON}
        onApply={applyProjections}
        onReset={resetProjections}
      />
      <div className="head-actions">
        {screen === "board" && (
          <>
            <button className="pill" aria-pressed={sourceId === "demo"} onClick={() => setSourceId("demo")}>
              Demo auction
            </button>
            <button
              className="pill" aria-pressed={sourceId === "poll"} disabled={!leagueId}
              title={leagueId ? `Polling league ${leagueId} every 3s` : "Add your league id in Settings first"}
              onClick={() => setSourceId("poll")}
            >
              ESPN live{leagueId ? "" : " (needs league id)"}
            </button>
            <button className="pill" aria-pressed={sourceId === "extension"} onClick={() => setSourceId("extension")}>
              Extension
            </button>
          </>
        )}
        <button className="pill" onClick={() => setScreen(screen === "setup" ? "board" : "setup")}>
          {screen === "setup" ? "Back to board" : "Settings"}
        </button>
      </div>
    </header>
  );

  if (screen === "setup") {
    return (
      <div className="app">
        {header}
        <Setup
          league={league} board={board} onLeague={setLeague} onOpen={openBoard}
          leagueId={leagueId} onLeagueId={setLeagueId}
          teams={draft.teams} onPickMe={(teamId) => dispatch({ kind: "pickMe", teamId })}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {header}

      {draft.error && (
        <div className="banner">
          <strong>ESPN sync</strong> {draft.error}
          <button className="linky" onClick={() => setSourceId("demo")}>switch to demo</button>
        </div>
      )}

      <Board
        view={view}
        drawerOpen={drawerOpen}
        onDrawer={setDrawerOpen}
        onPlayer={setDetailId}
        onSale={(playerId, price, teamId) => dispatch({ kind: "manualSale", playerId, price, teamId })}
        onNominate={(playerId, bid) => dispatch({ kind: "nominate", playerId, bid })}
        onBid={(bid) => dispatch({ kind: "setBid", bid })}
      />

      {detailId && (
        <PlayerDetail view={view} playerId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
