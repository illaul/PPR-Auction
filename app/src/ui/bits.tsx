export const money = (n: number, places = 0) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places })}`;

export const pct = (n: number, places = 1) => `${(n * 100).toFixed(places)}%`;

export function Cap({ children, hot }: { children: React.ReactNode; hot?: boolean }) {
  return <span className={hot ? "cap hot" : "cap"}>{children}</span>;
}

export function Dot({ kind }: { kind: "live" | "off" | "mine" }) {
  return <span className={`dot ${kind}`} />;
}
