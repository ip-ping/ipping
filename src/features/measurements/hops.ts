import type { Hop } from "@/components/viz/route-ladder";

/** A trace of one round sends three probes to each hop; a repeated trace says how many it sent. */
export const PROBES_PER_ROUND = 3;

export type HopStats = {
  sent: number;
  answered: number;
  /** Share of the probes that got no answer, 0 to 100. */
  lossPct: number;
  best: number | null;
  avg: number | null;
  worst: number | null;
  /** Standard deviation of the answers: how much the time moves around. */
  jitter: number | null;
};

export function hopStats(rtts: number[], sent: number = PROBES_PER_ROUND): HopStats {
  const probes = Math.max(sent, rtts.length, 1);
  if (rtts.length === 0) {
    return { sent: probes, answered: 0, lossPct: 100, best: null, avg: null, worst: null, jitter: null };
  }
  const avg = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const variance = rtts.reduce((a, b) => a + (b - avg) ** 2, 0) / rtts.length;
  return {
    sent: probes,
    answered: rtts.length,
    lossPct: ((probes - rtts.length) * 100) / probes,
    best: Math.min(...rtts),
    avg,
    worst: Math.max(...rtts),
    jitter: rtts.length > 1 ? Math.sqrt(variance) : null,
  };
}

export type LossKind = "none" | "limited" | "carried";

/** Percentage points of slack when comparing the loss of two hops: a few probes either way is chance. */
const LOSS_SLACK = 15;

/**
 * What the loss at each hop means. A router that answers only some of the probes sent *to it* may simply be
 * rate-limiting its own replies; traffic that passes through it is fine. Loss matters when it carries on:
 * every later hop that answers loses about as much (or more), all the way to the destination. So:
 *
 * - `none`: nothing was lost at this hop;
 * - `carried`: the loss continues at every later hop that answers, so packets really are being dropped here;
 * - `limited`: later hops lose less, so this router is slow to answer probes aimed at it, not dropping traffic.
 *
 * Only meaningful when the hops were probed several times (`sent` above one round); with three probes a single
 * loss is 33 %, which says nothing, so those hops are all `none`.
 */
export function lossKinds(hops: Hop[]): Map<number, LossKind> {
  const out = new Map<number, LossKind>();
  const stats = hops.map((hop) => (hop.sent != null && hop.sent > PROBES_PER_ROUND ? hopStats(hop.rtts, hop.sent) : null));
  hops.forEach((hop, i) => {
    const mine = stats[i];
    if (!mine || mine.answered === 0 || mine.lossPct === 0) {
      out.set(hop.ttl, "none");
      return;
    }
    const later = stats.slice(i + 1).filter((s): s is HopStats => s !== null && s.answered > 0);
    const carried = later.every((s) => s.lossPct >= mine.lossPct - LOSS_SLACK);
    out.set(hop.ttl, carried ? "carried" : "limited");
  });
  return out;
}
