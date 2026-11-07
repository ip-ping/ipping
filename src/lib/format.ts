export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function flag(country: string | null | undefined): string {
  if (!country || country.length !== 2) return "";
  return String.fromCodePoint(
    ...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export function place(node: { city?: string | null; country?: string | null }): string {
  return [node.city, node.country].filter(Boolean).join(", ") || "Unknown location";
}

/** How far a value moved: `+1.2`, `−0.4`, or `±0` when it is the same to the precision shown. */
export function delta(now: number, before: number): string {
  const diff = now - before;
  if (Math.abs(diff) < 0.05) return "±0";
  return `${diff > 0 ? "+" : "−"}${ms(Math.abs(diff))}`;
}
