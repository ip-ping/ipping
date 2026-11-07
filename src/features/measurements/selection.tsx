"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { Kind } from "./kinds";

/**
 * What is about to be measured, shared by the map and the form so that clicking stations on the map and
 * choosing nodes in the form are the same thing. Empty selection means "all online nodes".
 */
type Selection = {
  kind: Kind;
  setKind: (kind: Kind) => void;
  scope: "all" | "selected";
  setScope: (scope: "all" | "selected") => void;
  selected: ReadonlySet<string>;
  /** Replace the whole selection (the "Choose" dialog). */
  setSelected: (next: ReadonlySet<string>) => void;
  toggle: (id: string) => void;
  /** Add (or, with `additive` false, replace with) the nodes in a region. */
  pick: (ids: string[], additive: boolean) => void;
  clear: () => void;
};

const Context = createContext<Selection | null>(null);

type Choice = { scope: "all" | "selected"; selected: ReadonlySet<string> };
const NOTHING: Choice = { scope: "all", selected: new Set() };

export function SelectionProvider({ initialKind, children }: { initialKind: Kind; children: ReactNode }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  // scope and selection change together, so they are one piece of state
  const [{ scope, selected }, setChoice] = useState<Choice>(NOTHING);

  const setScope = useCallback((next: "all" | "selected") => setChoice((c) => ({ ...c, scope: next })), []);
  const setSelected = useCallback((next: ReadonlySet<string>) => setChoice((c) => ({ ...c, selected: new Set(next) })), []);
  const toggle = useCallback((id: string) => {
    setChoice((current) => {
      const next = new Set(current.selected);
      if (!next.delete(id)) next.add(id);
      return { scope: next.size === 0 ? "all" : "selected", selected: next };
    });
  }, []);
  const pick = useCallback((ids: string[], additive: boolean) => {
    if (ids.length === 0) return;
    setChoice((current) => ({ scope: "selected", selected: new Set([...(additive ? current.selected : []), ...ids]) }));
  }, []);
  const clear = useCallback(() => setChoice(NOTHING), []);

  const value = useMemo<Selection>(
    () => ({ kind, setKind, scope, setScope, selected, setSelected, toggle, pick, clear }),
    [kind, scope, setScope, selected, setSelected, toggle, pick, clear],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSelection(): Selection {
  const value = useContext(Context);
  if (!value) throw new Error("useSelection needs a SelectionProvider");
  return value;
}
