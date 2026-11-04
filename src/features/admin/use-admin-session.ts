"use client";

import { useEffect, useState } from "react";

import { api, ensureSession, setSession, type SessionInfo } from "@/lib/api/client";

type State =
  | { phase: "loading" }
  | { phase: "needs-setup" }
  | { phase: "signed-out" }
  | { phase: "admin"; username: string }
  | { phase: "error"; message: string };

async function load(): Promise<State> {
  try {
    const session = await ensureSession(true);
    if (session.authenticated) return { phase: "admin", username: session.username ?? "admin" };
    const { needs_setup } = await api<{ needs_setup: boolean }>("GET", "/setup/status");
    return { phase: needs_setup ? "needs-setup" : "signed-out" };
  } catch (e) {
    return { phase: "error", message: e instanceof Error ? e.message : "Could not reach the server." };
  }
}

export function useAdminSession() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    void load().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);

  const signedIn = (session: SessionInfo) => {
    setSession(session);
    setState({ phase: "admin", username: session.username ?? "admin" });
  };

  const signOut = async () => {
    await api("POST", "/admin/logout");
    setSession(null);
    setState(await load());
  };

  return { state, signedIn, signOut };
}
