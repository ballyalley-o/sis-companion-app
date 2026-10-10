import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDecision } from "@/src/decision";
import { isStaff, useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, ChipRow, EmptyState, ErrorState, Header, IconButton, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chips: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
}));

export default function Requests() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const staff = isStaff(user);
  const [status, setStatus] = useState(staff ? "pending" : "all");
  const res = useApi<any[]>(`/requests?status=${status}`);
  const d = useDecision();

  return (
    <View style={s.root} testID="requests-screen">
      <Header title={staff ? "Approvals" : "My requests"} subtitle={user?.role === "manager" ? `${user.warehouse_id} warehouse` : staff ? "All warehouses" : "Take & return history"}
        right={<IconButton testID="requests-new-button" icon="plus" onPress={() => router.push("/request/new")} />} />
      <View style={s.chips}>
        <ChipRow testIDPrefix="requests-filter" value={status} onChange={setStatus}
          options={[{ label: "Pending", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Rejected", value: "rejected" }, { label: "All", value: "all" }]} />
      </View>
      {res.isLoading ? <Loading text="Fetching requests…" /> : res.isError ? <ErrorState message={(res.error as Error).message} onRetry={res.refetch} /> : (
        <FlatList
          data={res.data}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={res.isRefetching} onRefresh={res.refetch} />}
          ListEmptyComponent={<EmptyState title={status === "pending" ? "Queue is clear" : "No requests"} text={status === "pending" ? "No pending approvals." : undefined} />}
          renderItem={({ item: r }) => (
            <Card testID={`request-card-${r.number}`} onPress={() => router.push({ pathname: "/request/[id]", params: { id: r.id } })} style={{ gap: spacing.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{r.number}</Mono>
                <Row style={{ gap: spacing.sm }}>
                  <StatusPill status={r.type} />
                  <StatusPill status={r.status} testID={`request-status-${r.number}`} />
                </Row>
              </Row>
              <View>
                <Body style={{ color: colors.onSurface, fontWeight: "800", fontSize: 17 }}>{r.driller_name} · {r.rig_number}</Body>
                <Label>{r.warehouse_id} · {fmtDate(r.created_at)}</Label>
              </View>
              {r.items.map((it: any) => (
                <Row key={it.product_id + it.bin_id} style={{ justifyContent: "space-between" }}>
                  <Body style={{ flex: 1 }} numberOfLines={1}>{it.sku} · {it.bin_code}</Body>
                  <Mono style={{ color: colors.onSurface }}>{it.qty} {it.unit}</Mono>
                </Row>
              ))}
              {staff && r.status === "pending" && (
                <Row>
                  <Button testID={`approve-${r.number}`} title="Approve" variant="success" icon="check-bold" style={{ flex: 1 }} loading={d.busy === r.id + "a"} onPress={() => d.approve(r)} />
                  <Button testID={`reject-${r.number}`} title="Reject" variant="danger" icon="close-thick" style={{ flex: 1 }} onPress={() => d.startReject(r)} />
                </Row>
              )}
            </Card>
          )}
        />
      )}
      {d.sheet}
    </View>
  );
}
