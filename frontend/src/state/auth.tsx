import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { api, loadToken, setToken, setUnauthorizedHandler } from "lib/api"
import { queryClient } from "state/query-client"

export type Role = "driller" | "manager" | "senior_drilling_manager" | "general_manager" | "administrator_2" | "admin"
export type User = { id: string; email: string; name: string; role: Role; warehouse_id: string | null; active?: boolean; rig_id?: string | null; photo_path?: string | null; created_at?: string | null }

type Ctx = {
    user: User | null
    ready: boolean
    login: (email: string, password: string) => Promise<void>
    loginWithGoogle: (credential: string) => Promise<void>
    logout: () => Promise<void>
    refreshUser: () => Promise<void>
}

const AuthContext = createContext<Ctx>({} as Ctx)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [ready, setReady] = useState(false)

    const logout = useCallback(async () => {
        await setToken("")
        queryClient.clear()
        setUser(null)
    }, [])

    useEffect(() => {
        setUnauthorizedHandler(() => {
            logout()
        });
        (async () => {
            const t = await loadToken()
            if (t) {
                try {
                    setUser(await api<User>("/auth/me"))
                } catch {
                    await setToken("")
                }
            }
            setReady(true)
        })()
    }, [logout])

    const loginWithGoogle = useCallback(async (credential: string) => {
        const res = await api<{ access_token: string; user: User }>("/auth/google", { method: "POST", body: { credential } })
        await setToken(res.access_token)
        setUser(res.user)
    }, [])

    const login = useCallback(async (email: string, password: string) => {
        const res = await api<{ access_token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } })
        await setToken(res.access_token)
        setUser(res.user)
    }, [])

    const refreshUser = useCallback(async () => { setUser(await api<User>("/auth/me")) }, [])

    return <AuthContext.Provider value={{ user, ready, login, loginWithGoogle, logout, refreshUser }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
export const isRegionalManager = (u: User | null): u is User & { role: "manager" | "senior_drilling_manager" } => u?.role === "manager" || u?.role === "senior_drilling_manager"
export const isStaff = (u: User | null) => Boolean(u && ["manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"].includes(u.role))
export const roleLabel = (role?: string) => ({ driller: "Driller", manager: "Warehouse manager", senior_drilling_manager: "Senior drilling manager", general_manager: "General manager", administrator_2: "Administrator 2", admin: "Administrator" }[role || ""] || role || "Unassigned")
