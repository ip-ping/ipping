"use client";

import { Panel } from "@/components/panel";
import { cn } from "@/lib/utils";
import type { Focus } from "@/lib/use-focus";

import type { AnswerGroup } from "./dns-groups";

/**
 * Do the nodes agree? One row per distinct answer, in the colour the map uses for it, with the nodes
 * that got it. TTLs are shown as a range and never split an answer: caching makes them differ.
 */
export function DnsAnswers({
  groups,
  total,
  waiting,
  focus,
}: {
  groups: AnswerGroup[];
  total: number;
  waiting: number;
  focus: Focus;
}) {
  const answers = groups.filter((g) => g.answered);
  const silent = groups.find((g) => !g.answered);
  const agree = answers.length === 1 && !silent && waiting === 0;
  return (
    <Panel
      label="Do the answers agree?"
      meta={
        <span className="num normal-case tracking-normal">
          {answers.length === 0 ? "no answers yet" : `${answers.length} distinct answer${answers.length === 1 ? "" : "s"}`}
        </span>
      }
      flush
    >
      <p className="border-b px-3 py-2 text-sm text-muted-foreground sm:px-4">
        {agree
          ? `All ${total} nodes got the same answer.`
          : answers.length > 1
            ? "The nodes disagree. A record that was changed recently reaches resolvers one by one, as their cached copies expire, so a mix of old and new answers is normal for a while."
            : waiting > 0
              ? `Waiting for ${waiting} of ${total} nodes…`
              : "Compare the answers below with what you expect."}
      </p>
      <ul className="divide-y">
        {groups.map((group) => {
          const lit = group.nodeIds.includes(focus.active ?? "");
          return (
            <li key={group.key} className={cn("grid gap-x-4 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-4", lit && "bg-signal-soft")}>
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden
                  className={cn("mt-1 size-3 shrink-0", !group.answered && "border border-foreground/50")}
                  style={{ background: group.answered ? group.color : "transparent" }}
                />
                <div className="min-w-0 space-y-1">
                  <div className="space-y-0.5 font-mono text-sm [overflow-wrap:anywhere]">
                    {group.lines.map((line, i) => (
                      <div key={`${i}-${line}`}>{line}</div>
                    ))}
                  </div>
                  <div className="label flex flex-wrap gap-x-4 gap-y-1 normal-case tracking-normal">
                    {group.rcode && group.rcode !== "NOERROR" && <span className="text-foreground">{group.rcode}</span>}
                    {group.ttl && (
                      <span>
                        TTL {group.ttl[0] === group.ttl[1] ? group.ttl[0] : `${group.ttl[0]}–${group.ttl[1]}`} s
                      </span>
                    )}
                    {group.slot === null && group.answered && <span>grey on the map</span>}
                    {!group.answered && <span>shown hollow on the map</span>}
                  </div>
                </div>
              </div>
              <div className="min-w-0 sm:max-w-[26rem] sm:text-right">
                <div className="figure mb-1.5 text-2xl leading-none font-semibold tracking-[-0.02em]">
                  {group.nodeIds.length}
                  <span className="label ml-1.5 align-middle text-[0.65rem] font-normal tracking-wider">
                    {group.nodeIds.length === 1 ? "node" : "nodes"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 sm:justify-end">
                  {group.nodeIds.map((id, i) => (
                    <button
                      key={id}
                      type="button"
                      onPointerEnter={() => focus.setHover(id)}
                      onPointerLeave={() => focus.setHover(null)}
                      onFocus={() => focus.setHover(id)}
                      onBlur={() => focus.setHover(null)}
                      onClick={() => focus.pin(focus.pinned === id ? null : id)}
                      aria-pressed={focus.pinned === id}
                      className={cn(
                        "label border px-1.5 py-0.5 text-[0.65rem] normal-case tracking-normal transition-colors hover:border-foreground/60",
                        focus.active === id && "border-signal bg-signal-soft",
                      )}
                    >
                      {group.names[i]}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
