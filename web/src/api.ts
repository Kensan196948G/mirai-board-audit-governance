import type { ApiError, User } from "./types";

const TOKEN_KEY = "mirai_board_demo_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError | null,
  ) {
    super(error?.message ?? "通信エラーが発生しました");
  }
}

export async function api<T = unknown>(path: string, options: RequestInit & { token?: string | null } = {}): Promise<T> {
  const token = options.token !== undefined ? options.token : getToken();
  const headers: Record<string, string> = { "content-type": "application/json", ...(options.headers as Record<string, string> | undefined) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined") window.location.hash = "#/login";
    throw new ApiFailure(res.status, null);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = (body as { error?: ApiError } | null)?.error ?? null;
    throw new ApiFailure(res.status, err);
  }
  return body as T;
}

export async function login(userId: string): Promise<{ token: string; user: User; permissions: string[] }> {
  const res = await api<{ token: string; user: User; permissions: string[] }>("/auth/login", { method: "POST", token: null, body: JSON.stringify({ userId }) });
  setToken(res.token);
  return res;
}

export async function fetchMe(): Promise<{ user: User; permissions: string[] }> {
  return api("/auth/me");
}
