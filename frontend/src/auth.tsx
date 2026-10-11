import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api, loadToken, setToken, setUnauthorizedHandler } from "@/src/api";
import { queryClient } from "@/src/query-client";

export type Role = "driller" | "manager" | "admin";
export type User = { id: string; email: string; name: string; role: Role; warehouse_id: string | null };

type Ctx = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);

WebBrowser.maybeCompleteAuthSession();
const AUTH_URL = "https://auth.emergentagent.com/";
const sentIds = new Set<string>();

function extractSessionId(url?: string | null) {
  const m = url?.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    await setToken("");
    queryClient.clear();
    setUser(null);
  }, []);

  const exchange = useCallback(async (sessionId: string) => {
    if (sentIds.has(sessionId)) return false;
    sentIds.add(sessionId);
    const res = await api<{ session_token: string; user: User }>("/auth/session", { method: "POST", body: { session_id: sessionId } });
    await setToken(res.session_token);
    setUser(res.user);
    return true;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    (async () => {
      // 1) A fresh Google session_id in the URL wins over any stored token.
      const url = Platform.OS === "web" ? window.location.href : await Linking.getInitialURL();
      const sid = extractSessionId(url);
      if (sid) {
        try {
          await exchange(sid);
          if (Platform.OS === "web") {
            const clean = window.location.href.replace(/([?#&])session_id=[^&#]+&?/, "$1").replace(/[?#&]$/, "");
            window.history.replaceState(window.history.state, "", clean);
          }
          setReady(true);
          return;
        } catch {
          // fall through to stored session
        }
      }
      const t = await loadToken();
      if (t) {
        try {
          setUser(await api<User>("/auth/me"));
        } catch {
          await setToken("");
        }
      }
      setReady(true);
    })();
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) exchange(sid).catch(() => {});
    });
    return () => sub.remove();
  }, [logout, exchange]);

  const loginWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const redirect = window.location.origin + "/";
      window.location.href = `${AUTH_URL}?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    const redirect = Linking.createURL("");
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => { captured = url; });
    try {
      const result = await WebBrowser.openAuthSessionAsync(`${AUTH_URL}?redirect=${encodeURIComponent(redirect)}`, redirect);
      const url = (result.type === "success" ? result.url : null) || captured || (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (!sid) {
        if (result.type === "cancel" || result.type === "dismiss") return;
        throw new Error("Google sign-in did not complete");
      }
      await exchange(sid);
    } finally {
      sub.remove();
    }
  }, [exchange]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } });
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  return <AuthContext.Provider value={{ user, ready, login, loginWithGoogle, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const isStaff = (u: User | null) => u?.role === "manager" || u?.role === "admin";
