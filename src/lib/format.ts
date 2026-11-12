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
  /** The provider's name is made to stand out wherever the node is shown. */
  sponsored?: boolean | null;
};

/** One piece of a line about a node's network or place. `sponsored` marks a sponsored node's provider: the one to make stand out. */
export type NetworkPart = { text: string; sponsored?: boolean };

const joined = (parts: readonly NetworkPart[]) => parts.map((part) => part.text).join(" · ");

/** The words of a node's network (its provider, then its AS number), whichever half is known, as the parts a line is drawn from. */
export function networkParts(node: Pick<NodeWords, "provider" | "asn" | "sponsored">): NetworkPart[] {
  const parts: NetworkPart[] = [];
  if (node.provider) parts.push(node.sponsored ? { text: node.provider, sponsored: true } : { text: node.provider });
  if (node.asn) parts.push({ text: `AS${node.asn}` });
  return parts;
}

/** "OVH SAS · AS16276": whose network a node is on, whichever half is known. */
export function networkOf(node: Pick<NodeWords, "provider" | "asn">): string {
  return joined(networkParts(node));
}

/** The same line for a place that can only hold text (an option of a list): a sponsored provider is marked with a star. */
export function networkText(parts: readonly NetworkPart[]): string {
  return joined(parts.map((part) => (part.sponsored ? { text: `★ ${part.text}` } : part)));
}

/**
 * How a node is introduced where its place and its network are both shown: by the place alone, with the network beneath,
 * and without its name (a node is named after its place and network unless somebody named it, so the name would only
 * repeat them). A node missing either has nothing else to be told apart by, so it keeps its name. The line beneath comes
 * as `sub` (text) and as `parts`, which a sponsored node's provider is marked in: draw it with `NetworkName`.
 */
export function nodeHeading(node: NodeWords): { title: string; sub: string; parts: NetworkPart[]; named: boolean } {
  const located = !!(node.city || node.country);
  const network = networkParts(node);
  if (located && network.length > 0) return { title: place(node), sub: joined(network), parts: network, named: false };
  const parts = [...(located ? [{ text: place(node) }] : []), ...network];
  return { title: node.name, sub: joined(parts), parts, named: true };
}

/** The shortest way to tell a node: its place, or its name when it has none (for a chart's row label). */
export function shortName(node: NodeWords): string {
  return node.city || node.country ? place(node) : node.name;
}
