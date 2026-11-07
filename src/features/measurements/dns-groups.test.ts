import { describe, expect, it } from "vitest";

import { dnsSample, sample, task } from "@/test/fixtures";

import { describeAnswer, groupAnswers, NO_ANSWER_COLOR, OTHER_COLOR, SLOT_COLORS } from "./dns-groups";

const withAnswer = (name: string, data: string, ttl = 300) =>
  task(name, { samples: [dnsSample([{ type: "A", data, ttl }])] });

describe("describeAnswer", () => {
  it("is the same answer whatever the TTL or the case", () => {
    const a = describeAnswer(withAnswer("A", "93.184.216.34", 300))!;
    const b = describeAnswer(withAnswer("B", "93.184.216.34", 5))!;
    expect(a.key).toBe(b.key);
    const upper = describeAnswer(task("C", { samples: [dnsSample([{ type: "CNAME", data: "Edge.Example.COM" }])] }))!;
    const lower = describeAnswer(task("D", { samples: [dnsSample([{ type: "CNAME", data: "edge.example.com" }])] }))!;
    expect(upper.key).toBe(lower.key);
  });

  it("is the same answer in whatever order the records came", () => {
    const x = describeAnswer(task("X", { samples: [dnsSample([{ type: "A", data: "1.1.1.1" }, { type: "A", data: "2.2.2.2" }])] }))!;
    const y = describeAnswer(task("Y", { samples: [dnsSample([{ type: "A", data: "2.2.2.2" }, { type: "A", data: "1.1.1.1" }])] }))!;
    expect(x.key).toBe(y.key);
    expect(x.lines).toEqual(["1.1.1.1", "2.2.2.2"]);
  });

  it("is a different answer when a record or the response code differs", () => {
    const base = describeAnswer(withAnswer("A", "93.184.216.34"))!;
    expect(describeAnswer(withAnswer("B", "93.184.217.34"))!.key).not.toBe(base.key);
    const nx = describeAnswer(task("N", { samples: [dnsSample([], "NXDOMAIN")] }))!;
    const empty = describeAnswer(task("E", { samples: [dnsSample([], "NOERROR")] }))!;
    expect(nx.key).not.toBe(empty.key);
    expect(nx.lines).toEqual(["no such name"]);
    expect(empty.lines).toEqual(["no records"]);
  });

  it("writes out the type only when it is not the one asked for", () => {
    const answer = describeAnswer(
      task("C", { samples: [dnsSample([{ type: "CNAME", data: "edge.example.com" }, { type: "A", data: "1.2.3.4" }])] }),
    )!;
    expect(answer.lines).toEqual(["CNAME edge.example.com", "1.2.3.4"]);
  });

  it("has no answer while the node is still working, and 'none' when it ended with nothing", () => {
    expect(describeAnswer(task("W", { status: "running" }))).toBeNull();
    expect(describeAnswer(task("T", { samples: [sample({ seq: 0, status: "timeout" })] }))!.key).toBe("none");
    expect(describeAnswer(task("F", { status: "failed", error_message: "No resolver" }))!.lines).toEqual(["No resolver"]);
  });
});

describe("groupAnswers", () => {
  const tasks = [
    withAnswer("Amsterdam", "1.1.1.1"),
    withAnswer("Tokyo", "2.2.2.2"),
    withAnswer("Dallas", "1.1.1.1", 60),
    task("Silent", { samples: [sample({ seq: 0, status: "timeout" })] }),
    task("Busy", { status: "running" }),
  ];

  it("groups nodes by answer, the largest group first and a silent node last", () => {
    const groups = groupAnswers(tasks, new Map());
    expect(groups.map((g) => g.names)).toEqual([["Amsterdam", "Dallas"], ["Tokyo"], ["Silent"]]);
    expect(groups[0].ttl).toEqual([60, 300]);
    expect(groups.at(-1)!.answered).toBe(false);
  });

  it("colours the first four answers with their own slots and the rest grey", () => {
    const keys = tasks.slice(0, 2).map((t) => describeAnswer(t)!.key);
    const groups = groupAnswers(tasks, new Map([[keys[1], 0], [keys[0], 1]]));
    expect(groups.find((g) => g.names.includes("Tokyo"))!.color).toBe(SLOT_COLORS[0]);
    expect(groups.find((g) => g.names.includes("Amsterdam"))!.color).toBe(SLOT_COLORS[1]);
    // an answer that has no slot (a fifth one) is grey; a node with no answer is hollow
    expect(groupAnswers(tasks, new Map())[0].color).toBe(OTHER_COLOR);
    expect(groups.find((g) => g.names.includes("Silent"))!.color).toBe(NO_ANSWER_COLOR);
  });

  it("leaves a node that is still working out of every group", () => {
    expect(groupAnswers(tasks, new Map()).flatMap((g) => g.names)).not.toContain("Busy");
  });
});
