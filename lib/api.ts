/**
 * Tiny client for the Naija Childhood API (backend/). No dependencies.
 *
 * The app is offline-first: if NEXT_PUBLIC_API_URL isn't set, `apiEnabled` is
 * false and nothing ever goes over the network. Games never wait on a request.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const apiEnabled = API_URL.length > 0;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** How authed requests get (and renew) a token. Registered by the account store. */
interface AuthProvider {
  access(): string | null;
  /** Gets a fresh access token; resolves null if the session is gone. */
  renew(): Promise<string | null>;
}
let auth: AuthProvider | null = null;
export const setAuthProvider = (p: AuthProvider) => {
  auth = p;
};

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send the access token (and renew it once on 401). */
  authed?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function once<T>(path: string, o: Options, token: string | null): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 8000);
  o.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: o.method ?? "GET",
      headers: {
        ...(o.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: ctrl.signal,
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, typeof data.message === "string" ? data.message : "Something went wrong", data.issues);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T>(path: string, o: Options = {}): Promise<T> {
  if (!apiEnabled) throw new ApiError(0, "Online features are off");
  if (!o.authed) return once<T>(path, o, null);
  let token = auth?.access() ?? null;
  if (!token) token = (await auth?.renew()) ?? null;
  if (!token) throw new ApiError(401, "Log in to do that");
  try {
    return await once<T>(path, o, token);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    const fresh = await auth?.renew();
    if (!fresh) throw e;
    return once<T>(path, o, fresh);
  }
}

/** Runs `fn` when the browser is idle (never competes with a frame). */
export function whenIdle(fn: () => void, timeout = 3000) {
  if (typeof window === "undefined") return;
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else setTimeout(fn, 1200);
}
