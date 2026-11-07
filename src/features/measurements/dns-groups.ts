"use client";

import { useMemo, useState } from "react";

import type { Task } from "@/lib/api/client";

/** The colours a group of identical answers can wear: the first four, in the order they appeared. */
export const SLOT_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];
/** Answers beyond the fourth distinct one share this, and are told apart by their text. */
export const OTHER_COLOR = "var(--muted-foreground)";
/** A node that got no answer is drawn hollow. */
export const NO_ANSWER_COLOR = "none";

/** Nodes that got exactly the same answer. */
export type AnswerGroup = {
  key: string;
  /** 0..3 for the first four distinct answers, null for the rest and for "no answer". */
  slot: number | null;
  /** False for a node that never got an answer (timeout, failure). */
  answered: boolean;
  /** The response code (`NOERROR`, `NXDOMAIN` ...); null when there was no answer. */
  rcode: string | null;
  /** The records as text, one per line, in a fixed order. */
  lines: string[];
  nodeIds: string[];
  names: string[];
  /** The smallest and largest TTL in the group: they differ with caching and do not make answers differ. */
  ttl: [number, number] | null;
  /** Wearing the colour of this group: a series colour, grey, or the "no answer" tone. */
  color: string;
};

/** What an answer with no records says, in words. */
function emptyAnswer(rcode: string): string {
  return (
    { NOERROR: "no records", NXDOMAIN: "no such name", SERVFAIL: "the resolver failed", REFUSED: "the resolver refused" }[rcode] ??
    rcode.toLowerCase()
  );
}

const TYPE_ORDER = ["CNAME", "A", "AAAA", "MX", "NS", "TXT", "SOA"];

type Sample = Task["samples"][number];

/** What this task's answer is, as text: the same text means the same answer, whatever the TTLs. */
export function describeAnswer(task: Task): { key: string; rcode: string | null; lines: string[]; ttls: number[] } | null {
  const sample: Sample | undefined = task.samples[0];
  if (!sample) {
    // a node that was given the task but ended without a sample: nothing came back
    return ["failed", "timed_out", "node_disconnected", "interrupted", "cancelled"].includes(task.status)
      ? { key: "none", rcode: null, lines: [task.error_message ?? "No answer"], ttls: [] }
      : null;
  }
  if (sample.status !== "ok" || !sample.dns) {
    return { key: "none", rcode: null, lines: [sample.status === "timeout" ? "No answer in time" : "No answer"], ttls: [] };
  }
  const { rcode } = sample.dns;
  const answers = sample.dns.answers ?? [];
  const asked = sample.dns.record_type;
  const ordered = [...answers].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.data.localeCompare(b.data),
  );
  // Only what differs from the question gets its type written out (a CNAME on the way to an address).
  const lines = ordered.map((a) => (a.type === asked ? a.data : `${a.type} ${a.data}`));
  const key = `${rcode}\n${ordered.map((a) => `${a.type} ${a.data.toLowerCase()}`).join("\n")}`;
  return { key, rcode, lines: lines.length ? lines : [emptyAnswer(rcode)], ttls: ordered.map((a) => a.ttl) };
}

/** Group the nodes by the answer they got. `slots` says which distinct answers have a colour. */
export function groupAnswers(tasks: Task[], slots: ReadonlyMap<string, number>): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const task of tasks) {
    const answer = describeAnswer(task);
    if (!answer) continue;
    let group = groups.get(answer.key);
    if (!group) {
      const answered = answer.key !== "none";
      const slot = answered ? (slots.get(answer.key) ?? null) : null;
      group = {
        key: answer.key,
        slot,
        answered,
        rcode: answer.rcode,
        lines: answer.lines,
        nodeIds: [],
        names: [],
        ttl: null,
        color: !answered ? NO_ANSWER_COLOR : slot === null ? OTHER_COLOR : SLOT_COLORS[slot],
      };
      groups.set(answer.key, group);
    }
    group.nodeIds.push(task.node.id);
    group.names.push(task.node.name);
    if (answer.ttls.length) {
      const low = Math.min(...answer.ttls);
      const high = Math.max(...answer.ttls);
      group.ttl = group.ttl ? [Math.min(group.ttl[0], low), Math.max(group.ttl[1], high)] : [low, high];
    }
  }
  // answers that most nodes agree on first, a silent node last
  return [...groups.values()].sort(
    (a, b) => Number(b.answered) - Number(a.answered) || b.nodeIds.length - a.nodeIds.length,
  );
}

/**
 * A colour for each of the first four distinct answers, in the order they were first seen. Once an
 * answer has a colour it keeps it, so a node that answers late never repaints the others.
 */
export function useAnswerSlots(tasks: Task[]): ReadonlyMap<string, number> {
  const keys = useMemo(
    () => [...new Set(tasks.map((t) => describeAnswer(t)?.key).filter((k): k is string => !!k && k !== "none"))],
    [tasks],
  );
  const [slots, setSlots] = useState<ReadonlyMap<string, number>>(new Map());
  // Derived from what has arrived, so it is updated while rendering (React re-renders at once) rather
  // than in an effect that would paint the old colours first.
  const missing = keys.filter((k) => !slots.has(k));
  if (missing.length > 0 && slots.size < SLOT_COLORS.length) {
    const next = new Map(slots);
    for (const key of missing) if (next.size < SLOT_COLORS.length) next.set(key, next.size);
    setSlots(next);
  }
  return slots;
}
