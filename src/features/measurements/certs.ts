import type { Task } from "@/lib/api/client";

import { OTHER_COLOR, SLOT_COLORS } from "./dns-groups";

/** A certificate with this many days left or fewer is worth a warning: the same limit a watch alerts at. */
export const EXPIRY_WARNING_DAYS = 14;

export type CertState = "ok" | "soon" | "bad";

/** Nodes that were shown the same certificate (and judged it the same way). */
export type CertGroup = {
  key: string;
  subject: string | null;
  issuer: string | null;
  notBefore: string | null;
  notAfter: string | null;
  verified: boolean;
  verifyError: string | null;
  version: string | null;
  /** "quic" when the handshake was QUIC; null for TLS over TCP. */
  transport: string | null;
  /** The application protocol agreed (h3 over QUIC). */
  alpn: string | null;
  names: string[];
  chain: number | null;
  nodeIds: string[];
  nodeNames: string[];
  /** The colour this group's stations wear on the map. */
  color: string;
  slot: number | null;
};

const DAY = 86_400_000;

/** Whole days until the certificate expires (negative once it has), or null if it has no expiry date. */
export function daysUntil(notAfter: string | null | undefined, now = Date.now()): number | null {
  if (!notAfter) return null;
  const at = Date.parse(notAfter);
  return Number.isNaN(at) ? null : Math.floor((at - now) / DAY);
}

/**
 * How a certificate is doing. Not trusted, or already expired, is bad; with `EXPIRY_WARNING_DAYS` or fewer left
 * it is only a warning; with more, or with no date to go by, it is fine.
 */
export function certState(group: Pick<CertGroup, "verified" | "notAfter">, now = Date.now()): CertState {
  const days = daysUntil(group.notAfter, now);
  if (!group.verified || (days !== null && days < 0)) return "bad";
  return days !== null && days < EXPIRY_WARNING_DAYS ? "soon" : "ok";
}

/**
 * The certificates the nodes were shown, most common first. Two nodes are in one group when they saw the same
 * subject, issuer and validity and made the same trust decision; a node that got no certificate (a timeout, a
 * refused connection) is in none. Several groups mean the nodes were not talking to the same server, or the
 * certificate is being replaced and some have not seen the new one yet.
 */
export function certificatesOf(tasks: Task[]): CertGroup[] {
  const groups = new Map<string, CertGroup>();
  for (const task of tasks) {
    const detail = task.samples[0]?.tls;
    const info = detail?.tls;
    if (!detail || !info) continue;
    const key = [info.subject, info.issuer, info.not_before, info.not_after, info.verified, info.verify_error].join("|");
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        subject: info.subject ?? null,
        issuer: info.issuer ?? null,
        notBefore: info.not_before ?? null,
        notAfter: info.not_after ?? null,
        verified: info.verified === true,
        verifyError: info.verify_error ?? null,
        version: info.version ?? null,
        transport: detail.transport ?? null,
        alpn: detail.alpn ?? null,
        names: detail.names ?? [],
        chain: detail.chain ?? null,
        nodeIds: [],
        nodeNames: [],
        color: OTHER_COLOR,
        slot: null,
      };
      groups.set(key, group);
    }
    group.nodeIds.push(task.node.id);
    group.nodeNames.push(task.node.name);
  }
  const sorted = [...groups.values()].sort((a, b) => b.nodeIds.length - a.nodeIds.length || a.key.localeCompare(b.key));
  sorted.forEach((group, i) => {
    group.slot = i < SLOT_COLORS.length ? i : null;
    group.color = i < SLOT_COLORS.length ? SLOT_COLORS[i] : OTHER_COLOR;
  });
  return sorted;
}

/** The common name of a subject like `CN=example.com, O=Example`, or the subject as it is. */
export function commonName(subject: string | null | undefined): string {
  if (!subject) return "unknown";
  return /(?:^|,\s*)CN=([^,]+)/i.exec(subject)?.[1]?.trim() ?? subject;
}
