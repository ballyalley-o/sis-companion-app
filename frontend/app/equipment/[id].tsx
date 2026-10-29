import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, fileUrl } from "@/src/api";
import { isStaff, useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, ErrorState, H2, H3, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  photo: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
}));

function Photos({ paths }: { paths: string[] }) {
  const s = useStyles();
  if (!paths?.length) return null;
  return (
    <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
      {paths.map((p) => <Image key={p} source={{ uri: fileUrl(p) }} style={s.photo} contentFit="cover" />)}
    </Row>
  );
}

export default function EquipmentDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<any>(`/equipment/${id}`);
  const qr = useApi<any>(q.data ? `/qr?payload=${encodeURIComponent(q.data.code)}` : null);
  const e = q.data;
  const loan = e?.current_loan;

  const markAvailable = async () => {
    try {
      await api(`/equipment/${id}/available`, { method: "POST" });
      toast("Marked available");
      qc.invalidateQueries();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  return (
    <View style={s.root} testID="equipment-detail-screen">
      <Header title={e?.code || "Equipment"} subtitle={e?.name} />
      {q.isLoading ? <Loading text="Loading equipment details…" /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : e && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ gap: spacing.sm }}>
            <Row style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 4 }}>
                <H2>{e.name}</H2>
                <Label>{e.category} · {e.warehouse_id}</Label>
                <StatusPill testID="equipment-detail-status" status={e.overdue ? "overdue" : e.status} />
              </View>
              {qr.data && <Image source={{ uri: qr.data.data_uri }} style={{ width: 84, height: 84, borderRadius: radius.sm }} contentFit="contain" />}
            </Row>
          </Card>

          <Button testID="equipment-map-button" title="View on warehouse map" icon="map-marker" variant="ghost"
            onPress={() => router.push({ pathname: "/warehouse-map", params: { equipment_id: e.id, wh: e.warehouse_id } })} />

          {loan && (
            <Card style={{ gap: spacing.sm, borderColor: e.overdue ? colors.error : colors.warning, borderWidth: 2 }} testID="equipment-current-loan">
              <Label>Currently signed out</Label>
              <H3>{loan.driller_name} · {loan.rig_number}</H3>
              <Body>Out {fmtDate(loan.checkout_at)} · due {fmtDate(loan.due_at)}</Body>
              <Row><Label>Condition out</Label><StatusPill status={loan.checkout_condition} /></Row>
              {!!loan.checkout_notes && <Body>{loan.checkout_notes}</Body>}
              <Photos paths={loan.checkout_photos} />
            </Card>
          )}

          {e.status === "available" && (
            <Button testID="equipment-checkout-button" large title="Sign out" icon="account-arrow-right" onPress={() => router.push({ pathname: "/equipment/action", params: { id: e.id, mode: "checkout" } })} />
          )}
          {e.status === "checked_out" && (
            <Button testID="equipment-return-button" large title="Sign back in" icon="keyboard-return" variant="success" onPress={() => router.push({ pathname: "/equipment/action", params: { id: e.id, mode: "return" } })} />
          )}
          {e.status === "maintenance" && (
            <Card style={{ gap: spacing.md }}>
              <Body>Returned damaged — in maintenance until a manager clears it.</Body>
              {isStaff(user) && <Button testID="equipment-mark-available" title="Mark available" icon="wrench-check" onPress={markAvailable} />}
            </Card>
          )}

          <H3>Borrowing history</H3>
          {e.history.length === 0 && <Body>No borrowing history yet.</Body>}
          {e.history.map((h: any) => (
            <Card key={h.id} testID={`equipment-history-${h.id}`} style={{ gap: spacing.xs }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{h.driller_name}</Mono>
                <StatusPill status={h.status === "out" && h.due_at < new Date().toISOString() ? "overdue" : h.status} />
              </Row>
              <Body>Rig {h.rig_number}</Body>
              <Row><Label>Out {fmtDate(h.checkout_at)}</Label><StatusPill status={h.checkout_condition} /></Row>
              {h.return_at && <Row><Label>In {fmtDate(h.return_at)}</Label><StatusPill status={h.return_condition} /></Row>}
              {!!h.return_notes && <Body>{h.return_notes}</Body>}
              <Photos paths={[...(h.checkout_photos || []), ...(h.return_photos || [])]} />
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
