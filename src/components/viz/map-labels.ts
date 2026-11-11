import { px, py } from "@/lib/geo/project";

type Labelled = { id: string; lat: number; lon: number; ms?: number | null; online?: boolean; disabled?: boolean };

export type LabelPlacement = { text: string; x: number; y: number; anchor: "start" | "end" };

/** A round trip as a short number: one decimal below 100 ms, whole milliseconds above. */
export const shortMs = (ms: number) => (ms < 100 ? ms.toFixed(1) : String(Math.round(ms)));

const FONT = 2.8; // map units (the map is 360 wide)
const HEIGHT = FONT * 1.25;
const CHAR = FONT * 0.6;
const GAP = 2.3; // from the station's centre to the text
const STATION = 1.6; // a station's own reach (its dot and its outline), which a label must not sit on

type Box = { x0: number; x1: number; y0: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Where to write each node's fastest round trip beside its station on the map. Nodes crowd (Europe, the eastern US), so the
 * fastest come first, a number goes to the right of its station or else to the left, and one that would sit on another label or
 * on another station is left off (the tooltip still has it). `prefer` is the station being pointed at: it always gets its number.
 */
export function placeLabels(nodes: readonly Labelled[], prefer: string | null = null): Map<string, LabelPlacement> {
  const placed = new Map<string, LabelPlacement>();
  const taken: Box[] = [];
  const stations = nodes.map((n) => ({ id: n.id, x: px(n.lon), y: py(n.lat) }));
  const candidates = nodes
    .filter((n) => n.ms != null && n.ms > 0 && n.online !== false && !n.disabled)
    .sort((a, b) => Number(b.id === prefer) - Number(a.id === prefer) || (a.ms as number) - (b.ms as number));
  for (const node of candidates) {
    const text = shortMs(node.ms as number);
    const width = text.length * CHAR + 0.6;
    const x = px(node.lon);
    const y = py(node.lat);
    const sides: ("start" | "end")[] = ["start", "end"];
    let chosen: LabelPlacement | null = null;
    for (const anchor of sides) {
      const box: Box =
        anchor === "start"
          ? { x0: x + GAP, x1: x + GAP + width, y0: y - HEIGHT / 2, y1: y + HEIGHT / 2 }
          : { x0: x - GAP - width, x1: x - GAP, y0: y - HEIGHT / 2, y1: y + HEIGHT / 2 };
      const inside = box.x0 >= -6 && box.x1 <= 366;
      const free =
        inside &&
        !taken.some((t) => overlaps(box, t)) &&
        !stations.some(
          (s) => s.id !== node.id && overlaps(box, { x0: s.x - STATION, x1: s.x + STATION, y0: s.y - STATION, y1: s.y + STATION }),
        );
      if (free || (node.id === prefer && !chosen && anchor === "start")) {
        chosen = { text, x: anchor === "start" ? x + GAP : x - GAP, y: y + FONT * 0.35, anchor };
        taken.push(box);
        if (free) break;
      }
    }
    if (chosen) placed.set(node.id, chosen);
  }
  return placed;
}

export const LABEL_FONT = FONT;
