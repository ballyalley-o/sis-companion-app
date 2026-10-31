import { useEffect } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isStaff, useAuth } from "@/src/auth";
import { BinLabel } from "@/src/BinLabel";
import { useApi } from "@/src/hooks";
import { printLabels } from "@/src/label";
import { locateBin } from "@/src/warehouseMap";
import { Body, Button, Card, EmptyState, ErrorState, Header, H3, Label, Loading, Mono, Row, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
}));

export default function BinDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  const readOnly = view === "1";
  useEffect(() => {
    if (ready && !user) {
      router.replace({ pathname: "/login", params: { returnTo: `/bin/${id}?view=1` } });
    }
  }, [id, ready, router, user]);
  const q = useApi<any>(`/bins/${id}`);
  const qr = useApi<any>(q.data ? `/qr?payload=${encodeURIComponent(q.data.qr_payload)}` : null);
  const b = q.data;
  const location = locateBin(b?.code);

  const go = (type: "take" | "return", product_id: string) =>
    router.push({ pathname: "/request/new", params: { type, wh: b.warehouse_id, bin_id: b.id, product_id } });

  return (
    <View style={s.root} testID="bin-detail-screen">
      <Header title={b?.title || "Bin contents"} subtitle={b ? `${b.warehouse_id} · ${b.code}${location ? ` · ${location.section.area}` : ""}` : undefined} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : b && (
        <ScrollView contentContainerStyle={{ padding: desktop ? spacing.xl : spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <View testID="bin-responsive-layout" style={{ width: "100%", maxWidth: 1320, alignSelf: "center", flexDirection: desktop ? "row" : "column", alignItems: "flex-start", gap: spacing.xl }}>
            <View style={{ width: desktop ? 460 : "100%", maxWidth: desktop ? 460 : undefined, gap: spacing.lg }}>
              <Card style={{ gap: spacing.lg }}>
                <Label>Bin sticker</Label>
                <BinLabel testID="bin-label-preview" code={b.code} title={b.title} qr={qr.data?.data_uri} />
                {qr.isError && <View style={{ gap: spacing.sm }}><Body>Could not load the QR code.</Body><Button testID="bin-qr-retry" title="Retry QR" variant="secondary" onPress={() => qr.refetch()} /></View>}
                <Label style={{ fontSize: 10 }}>Wide sticker · 100 × 30 mm</Label>
              </Card>
              <Card style={{ gap: spacing.md }}>
                <H3>Location</H3>
                <Mono>{b.code}</Mono>
                <Row style={{ flexWrap: "wrap" }}><Label>{b.warehouse_id}</Label>{location && <Label>{location.section.area}</Label>}</Row>
                {location && <Body>{location.section.code} · Level {location.level} · Bay {location.bay}</Body>}
                {!!b.description && <Body style={{ fontSize: 13 }}>{b.description}</Body>}
                {readOnly && <Label style={{ fontSize: 10, color: colors.info }}>Read-only stock view</Label>}
              </Card>
              {!readOnly && isStaff(user) && <Row style={{ flexWrap: "wrap" }}>
                <Button testID="bin-print-label" title="Print label" icon="printer" variant="secondary" style={{ flex: 1, minWidth: 150 }} disabled={!qr.data}
                  onPress={() => qr.data && printLabels([{ code: b.code, title: b.title, data_uri: qr.data.data_uri }]).catch(e => toast(e.message, "error"))} />
                <Button testID="bin-receive" title="Receive" icon="truck-check" variant="success" style={{ flex: 1, minWidth: 130 }}
                  onPress={() => router.push({ pathname: "/receive", params: { wh: b.warehouse_id, bin_id: b.id } })} />
              </Row>}
            </View>
            <Card style={{ flex: desktop ? 1 : undefined, width: desktop ? undefined : "100%", minWidth: 0, gap: spacing.md }}>
              <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}><H3>Bin contents</H3><Label>{b.items.length} {b.items.length === 1 ? "SKU" : "SKUs"}</Label></Row>
              {b.items.length === 0 ? <EmptyState icon="package-variant" title="Bin is empty" /> : <>
                {desktop && <Row style={{ paddingVertical: spacing.sm }}><Label style={{ flex: 1 }}>Product / SKU</Label><Label>On hand</Label></Row>}
                {b.items.map((it: any) => <View key={it.product_id} testID={`bin-item-${it.sku}`} style={{ gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: 1, borderColor: colors.divider }}>
                  <Row style={{ alignItems: "flex-start", gap: spacing.lg }}>
                    <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                      <Body style={{ color: colors.onSurface, fontWeight: "800", fontSize: 16 }}>{it.name}</Body>
                      <Mono style={{ fontSize: 16 }}>{it.sku}</Mono>
                      {!!it.description && <Body style={{ color: colors.muted, fontSize: 13 }}>{it.description}</Body>}
                    </View>
                    <View style={{ alignItems: "flex-end", minWidth: 64 }}>
                      <Body style={{ fontSize: 28, fontWeight: "800", color: colors.onSurface }}>{it.qty}</Body>
                      <Label style={{ fontSize: 10 }}>{it.unit}</Label>
                    </View>
                  </Row>
                  {!readOnly && <Row style={{ flexWrap: "wrap" }}>
                    <Button testID={`bin-take-${it.sku}`} title="Take" icon="arrow-up-bold" style={{ flex: 1, minWidth: 110 }} disabled={it.qty <= 0} onPress={() => go("take", it.product_id)} />
                    <Button testID={`bin-return-${it.sku}`} title="Return" icon="arrow-down-bold" variant="secondary" style={{ flex: 1, minWidth: 110 }} onPress={() => go("return", it.product_id)} />
                  </Row>}
                </View>)}
              </>}
            </Card>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
