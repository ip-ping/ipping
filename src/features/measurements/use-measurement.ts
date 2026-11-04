"use client";

import { useEffect, useReducer } from "react";

import { api, errorMessage, type Measurement, type Sample, type Task } from "@/lib/api/client";

import { computeStats, summarize } from "./summary";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string; notFound: boolean }
  | { phase: "ready"; measurement: Measurement; lastSeq: number; live: boolean };

type Action =
  | { type: "loaded"; measurement: Measurement }
  | { type: "failed"; message: string; notFound: boolean }
  | { type: "event"; seq: number; name: string; data: unknown }
  | { type: "live"; live: boolean };

function withTask(tasks: Task[], id: string, change: (task: Task) => Task): Task[] {
  return tasks.map((task) => (task.id === id ? change(task) : task));
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return {
        phase: "ready",
        measurement: action.measurement,
        lastSeq: action.measurement.last_event_seq,
        live: action.measurement.status === "running",
      };
    case "failed":
      return { phase: "error", message: action.message, notFound: action.notFound };
    case "live":
      return state.phase === "ready" ? { ...state, live: action.live } : state;
    case "event": {
      if (state.phase !== "ready") return state;
      // A reconnect can replay events we already applied; sequence numbers make that harmless.
      if (action.seq <= state.lastSeq) return state;
      const { measurement } = state;
      const data = action.data as Record<string, unknown>;
      let next = measurement;

      if (action.name === "task.updated") {
        const update = data as unknown as Omit<Task, "samples">;
        const tasks = withTask(measurement.tasks, update.id, (task) => ({
          ...task,
          ...update,
          // Live rows keep the summary computed from samples until the node's final one arrives.
          summary: update.summary ?? summarize(task.samples),
          samples: task.samples,
        }));
        next = { ...measurement, tasks, stats: computeStats(tasks) };
      } else if (action.name === "sample") {
        const { task_id, ...rest } = data as unknown as Sample & { task_id: string };
        const tasks = withTask(measurement.tasks, task_id, (task) => {
          const samples = [...task.samples.filter((s) => s.seq !== rest.seq), rest].sort(
            (a, b) => a.seq - b.seq,
          );
          return { ...task, samples, summary: summarize(samples) };
        });
        next = { ...measurement, tasks, stats: computeStats(tasks) };
      } else if (action.name === "measurement.finished") {
        next = {
          ...measurement,
          status: data.status as Measurement["status"],
          stats: data.stats as Measurement["stats"],
          finished_at: new Date().toISOString(),
        };
        return { phase: "ready", measurement: next, lastSeq: action.seq, live: false };
      }
      return { ...state, measurement: next, lastSeq: action.seq };
    }
  }
}

const EVENTS = ["measurement.created", "task.updated", "sample", "measurement.finished"];

/**
 * Loads a measurement and keeps it current.
 *
 * The page first reads the full state, then subscribes to the event stream from the sequence
 * number that state already contains. EventSource reconnects by itself and resumes using
 * Last-Event-ID, so a dropped connection never loses a result.
 */
export function useMeasurement(id: string) {
  const [state, dispatch] = useReducer(reduce, { phase: "loading" } as State);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    api<Measurement>("GET", `/measurements/${id}`)
      .then((measurement) => {
        if (cancelled) return;
        dispatch({ type: "loaded", measurement });
        if (measurement.status !== "running") return;
        source = new EventSource(
          `/api/v1/measurements/${id}/events?after=${measurement.last_event_seq}`,
        );
        source.onopen = () => dispatch({ type: "live", live: true });
        for (const name of EVENTS) {
          source.addEventListener(name, (event) => {
            const message = event as MessageEvent<string>;
            dispatch({
              type: "event",
              seq: Number(message.lastEventId),
              name,
              data: JSON.parse(message.data),
            });
            if (name === "measurement.finished") source?.close();
          });
        }
        source.onerror = () => dispatch({ type: "live", live: false });
      })
      .catch((error) => {
        if (cancelled) return;
        const notFound = (error as { status?: number }).status === 404;
        dispatch({ type: "failed", message: errorMessage(error), notFound });
      });

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [id]);

  return state;
}
