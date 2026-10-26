import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isStaff, useAuth } from "@/src/auth";
import { BinLabel } from "@/src/BinLabel";
import { useApi } from "@/src/hooks";
import { printLabels } from "@/src/label";
import { Body, Button, Card, EmptyState, ErrorState, Header, Label, Loading, Mono, Row, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
}));

export default function BinDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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

  const go = (type: "take" | "return", product_id: string) =>
    router.push({ pathname: "/request/new", params: { type, wh: b.warehouse_id, bin_id: b.id, product_id } });

  return (
    <View style={s.root} testID="bin-detail-screen">
      <Header title={b ? `Bin ${b.code}` : "Bin"} subtitle={b ? `${b.warehouse_id} · ${b.zone || ""}` : undefined} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : b && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
          <BinLabel testID="bin-label-preview" code={b.code} title={b.title} qr={qr.data?.data_uri} />
          <Label>{b.description} · {b.items.length} SKU line(s) · sticker 100×50mm</Label>
          {!readOnly && isStaff(user) && (
            <Row>
              <Button testID="bin-print-label" title="Print" icon="printer" variant="secondary" style={{ flex: 1 }}
                onPress={() => qr.data && printLabels([{ code: b.code, title: b.title, data_uri: qr.data.data_uri }]).catch((e) => toast(e.message, "error"))} />
              <Button testID="bin-receive" title="Receive" icon="truck-check" variant="success" style={{ flex: 1 }}
                onPress={() => router.push({ pathname: "/receive", params: { wh: b.warehouse_id, bin_id: b.id } })} />
            </Row>
          )}
          {b.items.length === 0 && <EmptyState icon="package-variant" title="Bin is empty" />}
          {b.items.map((it: any) => (
            <Card key={it.product_id} testID={`bin-item-${it.sku}`} style={{ gap: spacing.md }}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Mono>{it.sku}</Mono>
                  <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{it.name}</Body>
                  <Body style={{ color: colors.muted, fontSize: 13 }}>{it.description}</Body>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Body style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface }}>{it.qty}</Body>
                  <Label>{it.unit}</Label>
                </View>
              </Row>
              {!readOnly && <Row>
                <Button testID={`bin-take-${it.sku}`} title="Take" icon="arrow-up-bold" style={{ flex: 1 }} disabled={it.qty <= 0} onPress={() => go("take", it.product_id)} />
                <Button testID={`bin-return-${it.sku}`} title="Return" icon="arrow-down-bold" variant="secondary" style={{ flex: 1 }} onPress={() => go("return", it.product_id)} />
              </Row>}
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
