import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, loadToken, setToken, setUnauthorizedHandler } from "@/src/api";
import { queryClient } from "@/src/query-client";

export type Role = "driller" | "manager" | "admin";
export type User = { id: string; email: string; name: string; role: Role; warehouse_id: string | null };

type Ctx = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    await setToken("");
    queryClient.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    (async () => {
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
  }, [logout]);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/google", { method: "POST", body: { credential } });
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } });
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  return <AuthContext.Provider value={{ user, ready, login, loginWithGoogle, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const isStaff = (u: User | null) => u?.role === "manager" || u?.role === "admin";
