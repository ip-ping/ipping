import { distanceKm, KM_PER_RTT_MS_MAX } from "./project";

export type EvidenceNode = {
  node_id: string;
  node_name: string;
  latitude: number;
  longitude: number;
  /** The node's smallest round trip to the target, in milliseconds. */
  rtt_ms: number;
  verified: boolean;
};

export type Conflict = {
  a: EvidenceNode;
  b: EvidenceNode;
  /** How far apart the two nodes are. */
  distanceKm: number;
  /** The most that two round trips that short could allow between the nodes (light's limit). */
  allowedKm: number;
};

/**
 * The pair of nodes whose answers cannot both be true of one place. If a target is within R1 km of one node
 * and R2 km of another, those nodes are at most R1 + R2 km apart (the triangle inequality), and light covers
 * at most 150 km per millisecond of round trip. Two nodes that are further apart than that allows measured
 * the target in two different places: the signature of an anycast address, or a node that is not where it
 * says it is. Only nodes whose position was verified are accused. Returns the worst offending pair, or null.
 */
export function findConflict(evidence: EvidenceNode[]): Conflict | null {
  const trusted = evidence.filter((e) => e.verified);
  let worst: (Conflict & { excess: number }) | null = null;
  for (let i = 0; i < trusted.length; i++) {
    for (let j = i + 1; j < trusted.length; j++) {
      const a = trusted[i];
      const b = trusted[j];
      const apart = distanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
      const allowed = (a.rtt_ms + b.rtt_ms) * KM_PER_RTT_MS_MAX;
      const excess = apart - allowed;
      if (excess > 0 && (worst === null || excess > worst.excess)) {
        worst = { a, b, distanceKm: apart, allowedKm: allowed, excess };
      }
    }
  }
  return worst && { a: worst.a, b: worst.b, distanceKm: worst.distanceKm, allowedKm: worst.allowedKm };
}
