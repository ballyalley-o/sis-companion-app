import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, ErrorState, H3, Header, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function ProductDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, wh } = useLocalSearchParams<{ id: string; wh?: string }>();
  const q = useApi<any>(`/products/${id}`);
  const mv = useApi<any[]>(`/movements?product_id=${id}${wh ? `&warehouse_id=${wh}` : ""}`);
  const p = q.data;

  return (
    <View style={s.root} testID="product-detail-screen">
      <Header title={p?.sku || "Product"} subtitle={p?.name} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : p && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ gap: spacing.sm }}>
            <H3>{p.name}</H3>
            <Body>{p.description}</Body>
            <Label>Reorder at {p.reorder_level} {p.unit} · Zoho item {p.zoho_item_id || "—"}</Label>
            <Row style={{ marginTop: spacing.sm }}>
              {["QLD", "NSW"].map((w) => (
                <Card key={w} style={{ flex: 1, backgroundColor: colors.surfaceTertiary }}>
                  <Label>{w}</Label>
                  <Body testID={`product-total-${w}`} style={{ fontSize: 30, fontWeight: "800", color: (p.totals[w] || 0) <= p.reorder_level ? colors.error : colors.onSurface }}>{p.totals[w] || 0}</Body>
                </Card>
              ))}
            </Row>
          </Card>
          <Label>Bin locations</Label>
          {p.locations.filter((l: any) => !wh || l.warehouse_id === wh).map((l: any) => (
            <Card key={l.bin_id} testID={`product-location-${l.bin_code}`} style={{ gap: spacing.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View>
                  <Mono>{l.bin_code}</Mono>
                  <Label>{l.warehouse_id}</Label>
                </View>
                <Body style={{ fontSize: 26, fontWeight: "800", color: colors.onSurface }}>{l.qty} {p.unit}</Body>
              </Row>
              <Button testID={`product-map-${l.bin_code}`} title="View on warehouse map" icon="map-marker" variant="ghost"
                onPress={() => router.push({ pathname: "/warehouse-map", params: { product_id: p.id, wh: l.warehouse_id, bin_id: l.bin_id } })} />
              <Row>
                <Button testID={`product-take-${l.bin_code}`} title="Take" icon="arrow-up-bold" style={{ flex: 1 }} disabled={l.qty <= 0}
                  onPress={() => router.push({ pathname: "/request/new", params: { type: "take", wh: l.warehouse_id, bin_id: l.bin_id, product_id: p.id } })} />
                <Button testID={`product-return-${l.bin_code}`} title="Return" icon="arrow-down-bold" variant="secondary" style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: "/request/new", params: { type: "return", wh: l.warehouse_id, bin_id: l.bin_id, product_id: p.id } })} />
              </Row>
            </Card>
          ))}
          <Label>Movement history</Label>
          <Button testID="product-full-history" title="Full stock history" icon="timeline-text-outline" variant="ghost" onPress={() => router.push({ pathname: "/history", params: { product_id: p.id } })} />
          <Card>
            {(mv.data || []).length === 0 ? <Body>No movements yet.</Body> : (mv.data || []).map((m) => (
              <Row key={m.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ color: colors.onSurface }}>{m.bin_code} · {m.driller_name || m.user_name}{m.rig_number ? ` · ${m.rig_number}` : ""}</Body>
                  <Label>{fmtDate(m.at)} · {m.type.replace("_", " ")}</Label>
                </View>
                <StatusPill status={m.delta < 0 ? "take" : "return"} label={m.delta > 0 ? `+${m.delta}` : String(m.delta)} />
              </Row>
            ))}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
