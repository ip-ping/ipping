import type { Schemas } from "@/lib/api/client";

export type IpInfo = Schemas["IpInfoOut"];
export type SourceAnswer = Schemas["SourceAnswerOut"];

/** The fields a vote is taken on, as the backend names them in `confidence`, `agrees` and `differs`. */
export type VotedField = "country" | "region" | "city" | "location" | "postal_code" | "time_zone" | "asn" | "organization";

/** How sure the answer is about a field, as a percentage, or `null` when it has no answer for it. */
export function sure(info: IpInfo, field: VotedField): number | null {
  return info.confidence?.[field] ?? null;
}

/** How sure the place that is shown is: the least sure of the parts that are shown (city, else region, else country). */
export function placeSure(info: IpInfo): number | null {
  const shown: VotedField[] = info.city ? ["city"] : info.region ? ["region"] : ["country"];
  return sure(info, shown[0]);
}

/** The words for where the databases put an address: "Falkenstein, Saxony, Germany" (the country code when it has no name). */
export function placeLine(info: IpInfo): string {
  const parts = [info.city, info.region, info.country_name ?? info.country].filter(Boolean);
  // a region that only repeats the city ("Berlin, Berlin, Germany") says nothing twice
  return parts.filter((part, i) => part !== parts[i - 1]).join(", ");
}

/** "AS24940 · Hetzner Online GmbH", whichever half the databases have. */
export function networkLine(info: IpInfo): string {
  return [info.asn ? `AS${info.asn}` : null, info.organization].filter(Boolean).join(" · ");
}

/** Where the record's point is, and how far off it may be: "50.47, 12.37 · within about 20 km". */
export function positionLine(info: IpInfo): string {
  if (info.latitude == null || info.longitude == null) return "";
  const point = `${info.latitude.toFixed(2)}, ${info.longitude.toFixed(2)}`;
  return info.accuracy_radius_km ? `${point} · within about ${info.accuracy_radius_km.toLocaleString()} km` : point;
}

/** What a source said, in a few words: "Mountain View, California, US · AS15169 Google LLC". Empty when it said nothing. */
export function saidLine(answer: SourceAnswer): string {
  const said = answer.said;
  const place = [said.city, said.region, said.country].filter(Boolean).join(", ");
  const network = [said.asn ? `AS${said.asn}` : null, said.organization].filter(Boolean).join(" ");
  return [place, network].filter(Boolean).join(" · ");
}

/** How many sources said something about the address. */
export function answered(info: IpInfo): number {
  return (info.sources ?? []).filter((s) => s.status === "ok").length;
}

/** What to say when there is no place to show: a private address is not looked up, an unknown one is not in the data. */
export function nothingToShow(info: IpInfo): string | null {
  if (!info.public) return "A private, reserved or otherwise non-routable address: nothing is looked up for it.";
  if (!info.found) return "The IP data sources know nothing about this address.";
  return null;
}

/** Whether text can be an IP address (IPv4 or IPv6): the backend decides for real, this only keeps a name or a URL from being sent. */
export function looksLikeAddress(text: string): boolean {
  return /^[0-9a-fA-F:.]+$/.test(text) && (text.includes(".") || text.includes(":"));
}
