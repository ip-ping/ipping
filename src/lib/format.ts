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
