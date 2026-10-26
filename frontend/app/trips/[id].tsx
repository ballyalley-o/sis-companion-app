import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { isStaff, useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { GoogleMapsAddress } from "@/src/GoogleMapsAddress";
import { Body, Button, Card, ErrorState, Field, H3, Header, IconButton, Label, Loading, Mono, Row, Sheet, StatusPill, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function TripDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<any>(`/trips/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const t = q.data;
  const staff = isStaff(user);

  const act = async (path: string, body: any, msg: string) => {
    setBusy(path);
    try {
      const r = await api(`/trips/${id}/${path}`, { method: "POST", body });
      toast(typeof msg === "string" ? msg : "Done");
      qc.invalidateQueries();
      return r;
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={s.root} testID="trip-detail-screen">
      <Header title={t?.number || "Trip"} subtitle={t ? `${t.start_date} → ${t.end_date} · ${t.warehouse_id}` : undefined}
        right={t && ["pending", "rejected"].includes(t.status) && (staff || t.driller_id === user?.id)
          ? <IconButton testID="trip-edit-button" icon="pencil" onPress={() => router.push({ pathname: "/trips/new", params: { id: t.id } })} /> : undefined} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : t && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ gap: spacing.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <H3>{t.driller_name} · {t.rig_number}</H3>
              <StatusPill status={t.status} testID="trip-status" />
            </Row>
            {!!t.site && <Body>{t.site}</Body>}
            <GoogleMapsAddress address={t.address} testID="trip-detail-address" />
            {!!t.notes && <Body style={{ color: colors.onSurface }}>“{t.notes}”</Body>}
            {t.short_lines > 0 && <StatusPill status="low" label={`${t.short_lines} item(s) short`} testID="trip-short-badge" />}
          </Card>

          <Card style={{ gap: spacing.md }}>
            <Label>Stock needed vs available ({t.warehouse_id})</Label>
            {t.items.map((it: any) => (
              <Row key={it.product_id} testID={`trip-line-${it.sku}`} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Mono>{it.sku}</Mono>
                  <Body numberOfLines={1}>{it.name}</Body>
                  <Label>On hand {it.on_hand} · reserved by other trips {it.reserved_other} · free {it.available}</Label>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Body style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface }}>{it.qty}</Body>
                  {it.short > 0 ? <StatusPill status="low" label={`short ${it.short}`} /> : <StatusPill status="available" label="OK" />}
                </View>
              </Row>
            ))}
          </Card>

          {t.reorders.length > 0 && (
            <Card style={{ gap: spacing.sm }} testID="trip-reorders">
              <Label>Reorders for this trip</Label>
              {t.reorders.map((r: any) => (
                <Row key={r.id} style={{ justifyContent: "space-between" }}>
                  <Body style={{ color: colors.onSurface }}>{r.number} · {r.items.length} line(s)</Body>
                  <StatusPill status={r.status === "open" ? "pending" : r.status === "ordered" ? "processing" : r.status === "received" ? "approved" : "cancelled"} label={r.status} />
                </Row>
              ))}
              {staff && <Button testID="trip-open-reorders" title="Manage reorders" variant="ghost" icon="cart-arrow-right" onPress={() => router.push("/reorders")} />}
            </Card>
          )}

          {staff && t.status === "pending" && (
            <Row>
              <Button testID="trip-approve-button" title="Approve" variant="success" icon="check-bold" style={{ flex: 1 }} loading={busy === "approve"} onPress={() => act("approve", { note: "" }, "Trip approved — stock reserved")} />
              <Button testID="trip-reject-button" title="Reject" variant="danger" icon="close-thick" style={{ flex: 1 }} onPress={() => setRejecting(true)} />
            </Row>
          )}
          {staff && t.short_lines > 0 && ["pending", "approved", "prepared"].includes(t.status) && (
            <Button testID="trip-reorder-button" title="Reorder shortages" icon="cart-plus" variant="secondary" loading={busy === "reorder"} onPress={() => act("reorder", {}, "Reorder raised for shortages")} />
          )}
          {staff && t.status === "approved" && (
            <Button testID="trip-prepare-button" title="Mark packed & ready" icon="package-variant-closed-check" loading={busy === "prepare"} onPress={() => act("prepare", { note: "" }, "Driller notified: ready to collect")} />
          )}
          {staff && ["approved", "prepared"].includes(t.status) && (
            <Button testID="trip-issue-button" large title="Issue stock to driller" icon="truck-delivery" variant="success" loading={busy === "issue"}
              onPress={async () => { const r = await act("issue", undefined, "Stock issued & posted to Zoho"); if (r?.request) router.push({ pathname: "/request/[id]", params: { id: r.request.id } }); }} />
          )}
          {t.issued_request_id && (
            <Button testID="trip-view-issue" title="View issue transaction" variant="ghost" icon="receipt" onPress={() => router.push({ pathname: "/request/[id]", params: { id: t.issued_request_id } })} />
          )}
          {["pending", "approved", "prepared", "rejected"].includes(t.status) && (staff || t.status === "pending") && (
            <Button testID="trip-cancel-button" title="Cancel trip" variant="secondary" icon="cancel" onPress={() => act("cancel", undefined, "Trip cancelled")} />
          )}

          <Card style={{ gap: spacing.sm }}>
            <Label>History</Label>
            {t.history.map((h: any, i: number) => (
              <Row key={i} style={{ alignItems: "flex-start" }}>
                <StatusPill status={h.status} />
                <View style={{ flex: 1 }}>
                  <Body style={{ color: colors.onSurface }}>{h.by}{h.note ? ` — ${h.note}` : ""}</Body>
                  <Label>{fmtDate(h.at)}</Label>
                </View>
              </Row>
            ))}
          </Card>
        </ScrollView>
      )}
      <Sheet visible={rejecting} onClose={() => setRejecting(false)} testID="trip-reject-sheet">
        <H3>Reject trip</H3>
        <Field testID="trip-reject-reason" label="Reason (sent to driller)" value={note} onChangeText={setNote} multiline />
        <Button testID="trip-reject-confirm" title="Confirm reject" variant="danger" loading={busy === "reject"}
          onPress={async () => { await act("reject", { note }, "Trip rejected"); setRejecting(false); setNote(""); }} />
      </Sheet>
    </View>
  );
}
