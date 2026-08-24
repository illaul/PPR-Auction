import { useRef, useState } from "react";
import { refreshFromExtension, refreshFromFile } from "../sync/refresh";
import { freshness, mergeProjections, validate, type ProjectionSet, type RawProjection } from "../state/projections";
import type { Player } from "../engine/valuation";

type State =
  | { kind: "idle" }
  | { kind: "pulling"; from: "espn" | "file" }
  | { kind: "done"; updated: number; added: number }
  | { kind: "error"; message: string };

export default function RefreshData({ base, current, season, onApply, onReset }: {
  /** The projections that shipped with the app — always the merge target. */
  base: Player[];
  current: ProjectionSet | null;
  season: number;
  onApply: (set: ProjectionSet) => void;
  onReset: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (rows: RawProjection[], source: "espn" | "file") => {
    if (!rows.length) throw new Error("That pull came back empty.");
    const merged = mergeProjections(base, rows);
    const problem = validate(merged.players);
    if (problem) throw new Error(`Kept the old numbers — ${problem}.`);
    onApply({ fetchedAt: new Date().toISOString(), source, players: merged.players });
    setState({ kind: "done", updated: merged.updated, added: merged.added });
  };

  const fromEspn = async () => {
    setState({ kind: "pulling", from: "espn" });
    try {
      apply(await refreshFromExtension(season), "espn");
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  };

  const fromFile = async (file: File) => {
    setState({ kind: "pulling", from: "file" });
    try {
      apply(await refreshFromFile(file), "file");
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  };

  const pulling = state.kind === "pulling";
  return (
    <div className="refresh">
      <button className="pill refresh-btn" onClick={fromEspn} disabled={pulling} aria-busy={pulling}>
        <span className={pulling ? "spin" : undefined} aria-hidden="true">⟳</span>
        {pulling ? (state.from === "espn" ? "Pulling from ESPN…" : "Reading file…") : "Refresh data"}
      </button>
      <div className="refresh-status">
        <span className="refresh-when">
          {freshness(current?.fetchedAt ?? null)}
          {current ? ` · ${current.source === "espn" ? "ESPN" : "file"}` : ""}
        </span>
        {state.kind === "done" && (
          <span className="refresh-ok">
            {state.updated} players re-ranked{state.added ? `, ${state.added} new` : ""}
          </span>
        )}
        {state.kind === "error" && <span className="refresh-err">{state.message}</span>}
        <span className="refresh-links">
          <button className="linky" onClick={() => fileRef.current?.click()}>load a file</button>
          {current && <button className="linky" onClick={() => { onReset(); setState({ kind: "idle" }); }}>reset</button>}
        </span>
      </div>
      <input
        ref={fileRef} type="file" accept=".json,.csv,.tsv,.txt" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) fromFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
