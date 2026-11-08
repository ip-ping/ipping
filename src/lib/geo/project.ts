// The world outline is plain latitude/longitude ("equirectangular"): a place sits at (lon + 180, 90 - lat)
// in a 360 x 180 box. These helpers keep every map and chart in the same coordinates.

export const px = (lon: number) => lon + 180;
export const py = (lat: number) => 90 - lat;

/** Light travels in fibre at about 100 km per millisecond of *round trip*: the "typical" reach of an RTT. */
export const KM_PER_RTT_MS = 100;
/** The physical limit (light in vacuum): nothing can be farther than this per millisecond of round trip. */
export const KM_PER_RTT_MS_MAX = 150;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * The outline of "everything within `km` of here", drawn on the flat map. A real geodesic circle, not an
 * ellipse, so a ring around Sydney or Stockholm is the right shape. Where it crosses the antimeridian the
 * path is split (and `wraps` is set, so the caller fills nothing and only strokes).
 */
export function circlePath(lat: number, lon: number, km: number, steps = 96): { d: string; wraps: boolean } {
  if (km <= 0) return { d: "", wraps: false };
  const delta = Math.min(km, 19_000) / 6371;
  const phi1 = rad(lat);
  const lambda1 = rad(lon);
  let d = "";
  let wraps = false;
  let previous: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const theta = (2 * Math.PI * i) / steps;
    const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
    const lambda2 =
      lambda1 +
      Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
    let longitude = ((deg(lambda2) + 540) % 360) - 180;
    if (longitude === -180) longitude = 180;
    const x = px(longitude);
    const y = py(deg(phi2));
    const jump = previous !== null && Math.abs(x - previous) > 180;
    if (jump) wraps = true;
    d += `${i === 0 || jump ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    previous = x;
  }
  return { d: wraps ? d : d + "Z", wraps };
}

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * A straight line on the map from one point to another, in map units (x = longitude + 180). When the short way
 * between them crosses the date line (the points are more than half the map apart), the line leaves one edge and
 * comes back on the other instead of crossing the whole sheet.
 */
export function routeSegment(ax: number, ay: number, bx: number, by: number): string {
  if (Math.abs(bx - ax) <= 180) return `M${ax} ${ay}L${bx} ${by}`;
  const [x1, y1, x2, y2] = ax < bx ? [ax, ay, bx, by] : [bx, by, ax, ay];
  const t = x1 / (x1 + 360 - x2);
  const edge = y1 + (y2 - y1) * t;
  return `M${x1} ${y1}L0 ${edge}M360 ${edge}L${x2} ${y2}`;
}
