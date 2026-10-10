import { useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";

/** GET query that refetches whenever the screen regains focus. */
export function useApi<T = any>(path: string | null) {
  const q = useQuery<T>({ queryKey: [path], queryFn: () => api<T>(path as string), enabled: !!path });
  const first = useRef(true);
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (path) refetch();
    }, [path, refetch]),
  );
  return q;
}

export function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
