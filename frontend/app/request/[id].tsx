import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { isStaff, useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, ErrorState, H3, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";
import { useDecision } from "@/src/decision";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function RequestDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const q = useApi<any>(`/requests/${id}`);
  const d = useDecision();
  const r = q.data;

  const cancel = async () => {
    try {
      await api(`/requests/${id}/cancel`, { method: "POST" });
      toast("Request cancelled", "info");
      qc.invalidateQueries();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={s.root} testID="request-detail-screen">
      <Header title={r?.number || "Request"} subtitle={r ? `${r.type} · ${r.warehouse_id}` : undefined} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : r && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ gap: spacing.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <StatusPill status={r.type} />
              <StatusPill status={r.status} testID="request-detail-status" />
            </Row>
            <H3>{r.driller_name}</H3>
            <Body>Rig {r.rig_number} · submitted by {r.submitted_by}</Body>
            <Label>{fmtDate(r.created_at)}</Label>
            {!!r.notes && <Body style={{ color: colors.onSurface }}>“{r.notes}”</Body>}
          </Card>
          <Card style={{ gap: spacing.md }}>
            <Label>Items</Label>
            {r.items.map((it: any) => (
              <Row key={it.product_id + it.bin_id} style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Mono>{it.sku}</Mono>
                  <Body>{it.name} · bin {it.bin_code}</Body>
                </View>
                <Body style={{ color: colors.onSurface, fontSize: 22, fontWeight: "800" }}>{r.type === "take" ? "−" : "+"}{it.qty}</Body>
              </Row>
            ))}
          </Card>
          {r.zoho_txn_id && (
            <Card testID="request-zoho-txn">
              <Label>Zoho inventory adjustment</Label>
              <Mono>{r.zoho_txn_id}</Mono>
              <Label>{r.zoho_mode === "mock" ? "Simulated (mock mode)" : "Posted to Zoho"}</Label>
            </Card>
          )}
          <Card style={{ gap: spacing.sm }}>
            <Label>Audit trail</Label>
            {r.history.map((h: any, i: number) => (
              <Row key={i} style={{ alignItems: "flex-start" }}>
                <StatusPill status={h.status} />
                <View style={{ flex: 1 }}>
                  <Body style={{ color: colors.onSurface }}>{h.by}</Body>
                  <Label>{fmtDate(h.at)}</Label>
                  {!!h.note && <Body>{h.note}</Body>}
                </View>
              </Row>
            ))}
          </Card>
          {isStaff(user) && r.status === "pending" && (
            <Row>
              <Button testID="request-detail-approve" title="Approve" variant="success" icon="check-bold" large style={{ flex: 1 }} loading={d.busy === r.id + "a"} onPress={() => d.approve(r)} />
              <Button testID="request-detail-reject" title="Reject" variant="danger" icon="close-thick" large style={{ flex: 1 }} onPress={() => d.startReject(r)} />
            </Row>
          )}
          {r.status === "pending" && r.submitted_by_id === user?.id && (
            <Button testID="request-detail-cancel" title="Cancel request" variant="secondary" icon="cancel" onPress={cancel} />
          )}
        </ScrollView>
      )}
      {d.sheet}
    </View>
  );
}
