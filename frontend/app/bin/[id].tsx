import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/src/hooks";
import { Body, Button, Card, EmptyState, ErrorState, Header, Label, Loading, Mono, Row } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  qr: { width: 96, height: 96, borderRadius: radius.sm, backgroundColor: c.surfaceInverse },
}));

export default function BinDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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
          <Card>
            <Row>
              {qr.data && <Image source={{ uri: qr.data.data_uri }} style={s.qr} contentFit="contain" />}
              <View style={{ flex: 1, gap: 4 }}>
                <Mono style={{ fontSize: 26 }}>{b.code}</Mono>
                <Body>{b.description}</Body>
                <Label>{b.items.length} SKU line(s)</Label>
              </View>
            </Row>
          </Card>
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
              <Row>
                <Button testID={`bin-take-${it.sku}`} title="Take" icon="arrow-up-bold" style={{ flex: 1 }} disabled={it.qty <= 0} onPress={() => go("take", it.product_id)} />
                <Button testID={`bin-return-${it.sku}`} title="Return" icon="arrow-down-bold" variant="secondary" style={{ flex: 1 }} onPress={() => go("return", it.product_id)} />
              </Row>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
