import type { SyncEvent, SyncSource } from "./types";

/** ESPN writes names its own way; the pool is keyed by slug. */
export type Resolver = (name: string, meta?: string | null) => string | null;

/**
 * The Chrome extension relays the ESPN draft room into the page with
 * window.postMessage. Nothing is requested from ESPN by this app itself —
 * the extension is the only thing that touches the draft room.
 */
export class ExtensionSync implements SyncSource {
  readonly id = "extension" as const;
  readonly label = "ESPN via extension";
  private onMessage?: (ev: MessageEvent) => void;
  private timer?: number;

  constructor(private resolve: Resolver) {}

  start(emit: (e: SyncEvent) => void) {
    let lastSeen = 0;
    this.onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const data = ev.data as { source?: string; event?: RelayEvent; sentAt?: number };
      if (data?.source !== "deflator-extension" || !data.event) return;
      lastSeen = Date.now();
      emit({ type: "status", connection: "live", latencyMs: data.sentAt ? Date.now() - data.sentAt : undefined });
      const named = this.toSyncEvent(data.event);
      if (named) emit(named);
    };
    window.addEventListener("message", this.onMessage);
    window.postMessage({ source: "deflator-app", type: "hello" }, window.location.origin);
    // No relay for 20s means the draft room tab is gone.
    this.timer = window.setInterval(() => {
      if (lastSeen && Date.now() - lastSeen > 20_000) emit({ type: "status", connection: "disconnected" });
    }, 5_000);
  }

  stop() {
    if (this.onMessage) window.removeEventListener("message", this.onMessage);
    if (this.timer) window.clearInterval(this.timer);
  }

  /** A name the pool does not contain is dropped: a wrong player is worse than none. */
  private toSyncEvent(e: RelayEvent): SyncEvent | null {
    switch (e.type) {
      case "nomination": {
        const id = this.resolve(e.playerName, e.meta);
        return id ? { type: "nomination", playerId: id, bid: e.bid, bidder: e.bidder ?? null } : null;
      }
      case "sold": {
        const id = this.resolve(e.playerName);
        return id ? { type: "sold", playerId: id, price: e.price, teamName: e.teamName } : null;
      }
      case "bid":
        return { type: "bid", bid: e.bid, bidder: e.bidder ?? null };
      case "clock":
        return { type: "clock", seconds: e.seconds };
      case "turn":
        return { type: "turn", yours: e.yours };
      case "status":
        return { type: "status", connection: e.connection };
    }
  }
}

/** What the content script sends: players by name, because that is all ESPN shows. */
type RelayEvent =
  | { type: "nomination"; playerName: string; meta?: string | null; bid: number; bidder?: string | null }
  | { type: "bid"; bid: number; bidder?: string | null }
  | { type: "clock"; seconds: number }
  | { type: "sold"; playerName: string; price: number; teamName: string }
  | { type: "turn"; yours: boolean }
  | { type: "status"; connection: "live" | "manual" | "disconnected" };
