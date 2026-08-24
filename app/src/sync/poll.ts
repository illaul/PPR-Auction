import type { SyncEvent, SyncSource } from "./types";
import type { Resolver } from "./extension";
import { fetchDraft, fetchPlayers } from "./espn";

/**
 * Reads the draft straight from ESPN every few seconds, through the dev
 * server's proxy. No extension involved.
 *
 * What this can and cannot see: ESPN's draft view lists **completed** picks, so
 * sales land within one poll and every price re-derives from them. The bid
 * currently climbing on the player being auctioned is not in that view at all —
 * put whoever is up on the block yourself from the drawer to price them.
 */
export class PollSync implements SyncSource {
  readonly id = "poll" as const;
  readonly label = "ESPN polling";
  private timer?: number;
  private stopped = false;
  private seen = new Set<number>();
  private names = new Map<number, { name: string; pos: string }>();
  private misses = 0;
  private sentTeams = "";

  constructor(
    private season: number,
    private leagueId: string,
    private resolve: Resolver,
    private intervalMs = 3000,
  ) {}

  async start(emit: (e: SyncEvent) => void) {
    try {
      const { players } = await fetchPlayers(this.season);
      for (const p of players) this.names.set(p.espnId, { name: p.name, pos: p.pos });
    } catch (err) {
      emit({ type: "status", connection: "disconnected" });
      emit({ type: "error", message: (err as Error).message });
      return;
    }
    const tick = async () => {
      if (this.stopped) return;
      await this.poll(emit);
      if (!this.stopped) this.timer = window.setTimeout(tick, this.intervalMs);
    };
    void tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) window.clearTimeout(this.timer);
  }

  private async poll(emit: (e: SyncEvent) => void) {
    const started = Date.now();
    try {
      const draft = await fetchDraft(this.season, this.leagueId);
      this.misses = 0;
      emit({ type: "status", connection: "live", latencyMs: Date.now() - started });

      // Only speak up when something actually changed — a board that re-renders
      // every three seconds is a board you cannot click a button on.
      const roster = draft.teams.map((t) => ({ id: String(t.id), name: t.name }));
      const signature = roster.map((t) => `${t.id}:${t.name}`).join("|");
      if (roster.length && signature !== this.sentTeams) {
        this.sentTeams = signature;
        emit({ type: "teams", teams: roster });
      }
      const teamName = new Map(draft.teams.map((t) => [t.id, t.name]));

      for (const pick of [...draft.picks].sort((a, b) => a.overall - b.overall)) {
        if (this.seen.has(pick.espnId)) continue;
        this.seen.add(pick.espnId);
        const known = this.names.get(pick.espnId);
        // A name we cannot place is skipped rather than guessed at.
        const id = known ? this.resolve(known.name, known.pos) : null;
        if (!id) continue;
        emit({
          type: "sold",
          playerId: id,
          price: pick.price,
          teamName: teamName.get(pick.teamId) ?? `Team ${pick.teamId}`,
        });
      }
    } catch (err) {
      this.misses += 1;
      // One dropped poll is a hiccup; three in a row is an outage worth showing.
      if (this.misses >= 3) {
        emit({ type: "status", connection: "disconnected" });
        emit({ type: "error", message: (err as Error).message });
      }
    }
  }
}
