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

/** "2 min. ago", in the interface's language (`Intl` has the words); an unreadable date gives an empty string. */
export function ago(iso: string, lang: string, now: number = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (!Number.isFinite(seconds)) return "";
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const [unit, size] = steps.find(([, size]) => Math.abs(seconds) >= size) ?? (["second", 1] as const);
  try {
    return new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" }).format(Math.round(seconds / size), unit);
  } catch {
    return "";
  }
}

type NodeWords = {
  name: string;
  city?: string | null;
  country?: string | null;
  provider?: string | null;
  asn?: number | null;
};

/** "OVH SAS · AS16276": whose network a node is on, whichever half is known. */
export function networkOf(node: Pick<NodeWords, "provider" | "asn">): string {
  return [node.provider, node.asn ? `AS${node.asn}` : null].filter(Boolean).join(" · ");
}

/**
 * How a node is introduced where its place and its network are both shown: by the place alone, with the network beneath,
 * and without its name (a node is named after its place and network unless somebody named it, so the name would only
 * repeat them). A node missing either has nothing else to be told apart by, so it keeps its name.
 */
export function nodeHeading(node: NodeWords): { title: string; sub: string; named: boolean } {
  const located = !!(node.city || node.country);
  const network = networkOf(node);
  if (located && network) return { title: place(node), sub: network, named: false };
  return { title: node.name, sub: [located ? place(node) : "", network].filter(Boolean).join(" · "), named: true };
}

/** The shortest way to tell a node: its place, or its name when it has none (for a chart's row label). */
export function shortName(node: NodeWords): string {
  return node.city || node.country ? place(node) : node.name;
}
