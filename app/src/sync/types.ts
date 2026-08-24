/** Everything that can drive the board: the extension, a poller, a human, or the demo. */
export type SyncEvent =
  | { type: "nomination"; playerId: string; bid: number; bidder: string | null }
  | { type: "bid"; bid: number; bidder: string | null }
  | { type: "clock"; seconds: number }
  | { type: "sold"; playerId: string; price: number; teamName: string }
  | { type: "turn"; yours: boolean }
  | { type: "teams"; teams: { id: string; name: string }[] }
  | { type: "error"; message: string }
  | { type: "status"; connection: "live" | "manual" | "disconnected"; latencyMs?: number };

export interface SyncSource {
  readonly id: "extension" | "demo" | "manual" | "poll";
  readonly label: string;
  start(emit: (e: SyncEvent) => void): void | Promise<void>;
  stop(): void;
}
