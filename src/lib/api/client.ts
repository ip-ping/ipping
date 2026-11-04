import type { components } from "./schema";

export type Schemas = components["schemas"];
export type Measurement = Schemas["MeasurementOut"];
export type Task = Schemas["TaskOut"];
export type Sample = Schemas["SampleOut"];
export type Summary = Schemas["Summary"];
export type PublicNode = Schemas["PublicNode"];
export type AdminNode = Schemas["AdminNode"];
export type SessionInfo = Schemas["SessionOut"];

/** The backend's single error shape: {"error": {"code", "message"}}. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let session: SessionInfo | null = null;
let pending: Promise<SessionInfo> | null = null;

/** Start (or resume) the browser session and remember its CSRF token. */
export function ensureSession(force = false): Promise<SessionInfo> {
  if (session && !force) return Promise.resolve(session);
  if (!pending || force) {
    pending = fetch("/api/v1/session", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw await toError(response);
        session = (await response.json()) as SessionInfo;
        return session;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Forget what we know about the session, e.g. after signing in or out. */
export function setSession(next: SessionInfo | null): void {
  session = next;
}

async function toError(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `The server answered ${response.status}.`;
  try {
    const body = await response.json();
    if (body?.error) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    // not JSON; keep the generic message
  }
  return new ApiError(response.status, code, message);
}

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const current = await ensureSession();
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "X-CSRF-Token": current.csrf_token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await toError(response);
    // The session may have expired or been replaced; get a fresh token once and try again.
    if (!retried && (error.code === "bad_csrf_token" || error.code === "session_required")) {
      await ensureSession(true);
      return api<T>(method, path, body, true);
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
