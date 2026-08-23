/** Matching the names ESPN shows to the players the model knows. */
import type { Player } from "../engine/valuation";

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;

function norm(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ESPN writes "Kyle Pitts", "Marvin Harrison Jr.", "Texans D/ST"; the pool has
 * its own spellings. Match on a normalised name, then on last name within the
 * position, and give up rather than guess.
 */
export function makeResolver(players: Player[]) {
  const exact = new Map<string, string>();
  const byLast = new Map<string, string[]>();
  for (const p of players) {
    exact.set(norm(p.name), p.id);
    const last = norm(p.name).split(" ").slice(-1)[0];
    byLast.set(last, [...(byLast.get(last) ?? []), p.id]);
    if (p.pos === "DEF") {
      // "Houston Texans" also answers to "Texans" and "Houston D/ST".
      const words = norm(p.name).split(" ");
      exact.set(words[words.length - 1], p.id);
      exact.set(`${words.slice(0, -1).join(" ")} dst`, p.id);
    }
  }
  return (name: string, meta?: string | null): string | null => {
    const n = norm(name.replace(/\bd\/?st\b/i, "dst"));
    const hit = exact.get(n);
    if (hit) return hit;
    const last = n.split(" ").slice(-1)[0];
    const candidates = byLast.get(last) ?? [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1 && meta) {
      const pos = meta.toUpperCase().match(/\b(QB|RB|WR|TE|K|D\/?ST)\b/)?.[1]?.replace("/", "");
      const byPos = candidates.filter((id) => players.find((p) => p.id === id)?.pos === (pos === "DST" ? "DEF" : pos));
      if (byPos.length === 1) return byPos[0];
    }
    return null;
  };
}
