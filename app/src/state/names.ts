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
  // A few players are listed at two positions, so every index maps to a list.
  const exact = new Map<string, string[]>();
  const byLast = new Map<string, string[]>();
  const posOf = new Map(players.map((p) => [p.id, p.pos as string]));
  const add = (map: Map<string, string[]>, key: string, id: string) =>
    map.set(key, [...(map.get(key) ?? []), id]);

  for (const p of players) {
    add(exact, norm(p.name), p.id);
    add(byLast, norm(p.name).split(" ").slice(-1)[0], p.id);
    if (p.pos === "DEF") {
      // "Houston Texans" also answers to "Texans" and "Houston D/ST".
      const words = norm(p.name).split(" ");
      add(exact, words[words.length - 1], p.id);
      add(exact, `${words.slice(0, -1).join(" ")} dst`, p.id);
    }
  }

  /** One candidate wins outright; several need the position to break the tie. */
  const settle = (ids: string[], meta?: string | null): string | null => {
    if (ids.length === 1) return ids[0];
    if (ids.length === 0 || !meta) return null;
    const raw = meta.toUpperCase().match(/\b(QB|RB|WR|TE|K|D\/?ST)\b/)?.[1]?.replace("/", "");
    if (!raw) return null;
    const want = raw === "DST" ? "DEF" : raw;
    const hits = ids.filter((id) => posOf.get(id) === want);
    return hits.length === 1 ? hits[0] : null;
  };

  return (name: string, meta?: string | null): string | null =>
    settle(exact.get(norm(name.replace(/\bd\/?st\b/i, "dst"))) ?? [], meta)
    ?? settle(byLast.get(norm(name).split(" ").slice(-1)[0]) ?? [], meta);
}
