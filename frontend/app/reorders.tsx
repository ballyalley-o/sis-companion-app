import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, ChipRow, EmptyState, ErrorState, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, chips: { borderBottomWidth: 1, borderBottomColor: c.divider } }));
const pill = (s: string) => (s === "open" ? "pending" : s === "ordered" ? "processing" : s === "received" ? "approved" : "cancelled");

export default function Reorders() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const q = useApi<any[]>(`/reorders?status=${status}`);

  const setSt = async (r: any, st: "ordered" | "cancelled") => {
    try {
      await api(`/reorders/${r.id}/status`, { method: "POST", body: { status: st } });
      toast(`${r.number} ${st}`);
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, "error"); }
  };

  return (
    <View style={s.root} testID="reorders-screen">
      <Header title="Reorders" subtitle="Purchase reorders raised against trips & low stock" />
      <View style={s.chips}>
        <ChipRow testIDPrefix="reorders-filter" value={status} onChange={setStatus}
          options={[{ label: "Open", value: "open" }, { label: "Ordered", value: "ordered" }, { label: "Received", value: "received" }, { label: "All", value: "all" }]} />
      </View>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <FlatList data={q.data} keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={q.refetch} />}
          ListEmptyComponent={<EmptyState icon="cart-check" title="No reorders" />}
          renderItem={({ item: r }) => (
            <Card testID={`reorder-card-${r.number}`} style={{ gap: spacing.sm }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{r.number}</Mono>
                <StatusPill status={pill(r.status)} label={r.status} />
              </Row>
              <Label>{r.warehouse_id}{r.trip_number ? ` · trip ${r.trip_number}` : ""}{r.needed_by ? ` · needed by ${r.needed_by}` : ""} · {fmtDate(r.created_at)}</Label>
              {r.items.map((i: any) => (
                <Row key={i.product_id} style={{ justifyContent: "space-between" }}>
                  <Body style={{ flex: 1 }} numberOfLines={1}>{i.sku} · {i.name}</Body>
                  <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{i.received || 0}/{i.qty}</Body>
                </Row>
              ))}
              {["open", "ordered"].includes(r.status) && (
                <Row>
                  {r.status === "open" && <Button testID={`reorder-ordered-${r.number}`} title="Ordered" variant="secondary" style={{ flex: 1 }} onPress={() => setSt(r, "ordered")} />}
                  <Button testID={`reorder-receive-${r.number}`} title="Receive" variant="success" icon="truck-check" style={{ flex: 1 }}
                    onPress={() => router.push({ pathname: "/receive", params: { wh: r.warehouse_id, reorder_id: r.id } })} />
                  <Button testID={`reorder-cancel-${r.number}`} title="Cancel" variant="danger" style={{ flex: 1 }} onPress={() => setSt(r, "cancelled")} />
                </Row>
              )}
              {r.trip_id && <Button testID={`reorder-trip-${r.number}`} title="View trip" variant="ghost" icon="calendar" onPress={() => router.push({ pathname: "/trips/[id]", params: { id: r.trip_id } })} />}
            </Card>
          )} />
      )}
    </View>
  );
}
