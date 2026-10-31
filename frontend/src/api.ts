import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

// Web previews use same-origin /api when no separate backend URL is configured.
export const BASE = `${(process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")}/api`;
export const TOKEN_KEY = "drillstock_token";

let token = "";
let onUnauthorized: (() => void) | null = null;

export async function loadToken() {
  token = (await storage.secureGet<string>(TOKEN_KEY, "")) || "";
  return token;
}
export async function setToken(t: string) {
  token = t;
  if (t) await storage.secureSet(TOKEN_KEY, t);
  else await storage.secureRemove(TOKEN_KEY);
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function errMessage(data: any, status: number) {
  const d = data?.detail;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ");
  return d || `Request failed (${status})`;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method || "GET",
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error("No connection. Check your network and retry.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && onUnauthorized) onUnauthorized();
  if (!res.ok) throw new Error(errMessage(data, res.status));
  return data as T;
}

export async function uploadPhoto(uri: string): Promise<string> {
  const form = new FormData();
  const name = `photo-${Date.now()}.jpg`;
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: "image/jpeg" } as any);
  }
  const res = await fetch(`${BASE}/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errMessage(data, res.status));
  return data.path;
}

export function fileUrl(path: string) {
  return `${BASE}/files/${path}?token=${encodeURIComponent(token)}`;
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
