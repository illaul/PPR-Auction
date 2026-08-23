import type { SyncEvent, SyncSource } from "./types";
import type { Board, PricedPlayer } from "../engine/valuation";

/**
 * Runs a plausible auction off the real player pool so the board can be driven
 * without a live draft: nominate, bid up, sell, repeat. Bids climb toward the
 * site's market price, which is exactly where the model disagrees.
 */
export class DemoSync implements SyncSource {
  readonly id = "demo" as const;
  readonly label = "Demo auction";
  private timer?: number;
  private queue: PricedPlayer[];
  private current?: PricedPlayer;
  private bid = 0;
  private clock = 20;
  private target = 0;
  private teamIdx = 0;

  constructor(
    private board: Board,
    private teams: string[],
    private marketScale: number,
    private skip: Set<string>,
  ) {
    this.queue = board.players
      .filter((p) => p.price > 0 && !skip.has(p.id))
      .slice(0, 60);
  }

  start(emit: (e: SyncEvent) => void) {
    emit({ type: "status", connection: "live", latencyMs: 400 });
    const tick = () => {
      if (!this.current) return this.nominate(emit);
      if (this.bid >= this.target || this.clock <= 1) {
        emit({ type: "sold", playerId: this.current.id, price: this.bid, teamName: this.bidderName() });
        this.current = undefined;
        return;
      }
      this.bid += this.bid < this.target * 0.7 ? Math.max(2, Math.round(this.target * 0.08)) : 1;
      this.clock = Math.max(1, this.clock - 2);
      this.teamIdx = (this.teamIdx + 1) % this.teams.length;
      emit({ type: "bid", bid: this.bid, bidder: this.bidderName() });
      emit({ type: "clock", seconds: this.clock });
    };
    this.timer = window.setInterval(tick, 1300);
  }

  stop() { if (this.timer) window.clearInterval(this.timer); }

  private sinceTurn = 0;

  private nominate(emit: (e: SyncEvent) => void) {
    const next = this.queue.shift();
    if (!next) return;
    this.sinceTurn += 1;
    emit({ type: "turn", yours: this.sinceTurn % 5 === 0 });
    this.current = next;
    const market = (next.market?.yahoo ?? 0) * this.marketScale;
    this.target = Math.max(1, Math.round(market || next.price));
    this.bid = Math.max(1, Math.round(this.target * 0.35));
    this.clock = 20;
    this.teamIdx = (this.teamIdx + 1) % this.teams.length;
    emit({ type: "nomination", playerId: next.id, bid: this.bid, bidder: this.bidderName() });
    emit({ type: "clock", seconds: this.clock });
  }

  private bidderName() { return this.teams[this.teamIdx]; }
}
