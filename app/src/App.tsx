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
import Board from "./ui/Board";
import Setup from "./ui/Setup";
import PlayerDetail from "./ui/PlayerDetail";
import RefreshData from "./ui/RefreshData";
import { clearStored, loadStored, store, type ProjectionSet } from "./state/projections";
import type { Player } from "./engine/valuation";

type Action =
  | { kind: "event"; event: SyncEvent; teamId: (name: string) => string }
  | { kind: "reset"; state: DraftState }
  | { kind: "manualSale"; playerId: string; price: number; teamId: string }
  | { kind: "nominate"; playerId: string; bid: number };

function reducer(state: DraftState, action: Action): DraftState {
  switch (action.kind) {
    case "reset":
      return action.state;
    case "nominate":
      return { ...state, block: { playerId: action.playerId, bid: action.bid, bidder: null, clock: 20 } };
    case "manualSale":
      return {
        ...state,
        sales: [...state.sales, { playerId: action.playerId, price: action.price, teamId: action.teamId }],
        block: state.block?.playerId === action.playerId ? null : state.block,
      };
    case "event": {
      const e = action.event;
      switch (e.type) {
        case "status":
          return { ...state, connection: e.connection, latencyMs: e.latencyMs ?? state.latencyMs };
        case "turn":
          return { ...state, myTurn: e.yours };
        case "nomination":
          return { ...state, block: { playerId: e.playerId, bid: e.bid, bidder: e.bidder, clock: 20 } };
        case "bid":
          return state.block ? { ...state, block: { ...state.block, bid: e.bid, bidder: e.bidder } } : state;
        case "clock":
          return state.block ? { ...state, block: { ...state.block, clock: e.seconds } } : state;
        case "sold":
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
  const [sourceId, setSourceId] = useState<"demo" | "extension">("demo");
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
    const source: SyncSource = sourceId === "demo"
      ? new DemoSync(board, draft.teams.filter((t) => !t.isMe).map((t) => t.name), marketScale,
          new Set(draft.sales.map((s) => s.playerId)))
      : new ExtensionSync(resolver);
    sourceRef.current = source;
    source.start(emit);
    return () => { source.stop(); sourceRef.current = null; };
    // Restarting on every sale would reset the demo queue, so the deps stay narrow
    // on purpose: the source pushes, it never reads back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, sourceId, board]);

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
            <button className="pill" aria-pressed={sourceId === "extension"} onClick={() => setSourceId("extension")}>
              ESPN extension
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
        <Setup league={league} board={board} onLeague={setLeague} onOpen={openBoard} />
      </div>
    );
  }

  return (
    <div className="app">
      {header}

      <Board
        view={view}
        drawerOpen={drawerOpen}
        onDrawer={setDrawerOpen}
        onPlayer={setDetailId}
        onSale={(playerId, price, teamId) => dispatch({ kind: "manualSale", playerId, price, teamId })}
        onNominate={(playerId, bid) => dispatch({ kind: "nominate", playerId, bid })}
      />

      {detailId && (
        <PlayerDetail view={view} playerId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
