import { useEffect, useState } from "react";
import { FlatList, RefreshControl, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { CommonItems, DidYouMean } from "@/src/suggest";
import { Body, Card, ChipRow, EmptyState, ErrorState, H1, Icon, IconButton, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider, gap: spacing.sm, paddingBottom: spacing.xs },
  search: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.lg, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, paddingHorizontal: spacing.md, height: 56, gap: spacing.sm },
  input: { flex: 1, color: c.onSurface, fontFamily: fonts.text, fontSize: 17, height: 56 },
  qty: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface },
}));

export default function Stock() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [wh, setWh] = useState<string>(user?.warehouse_id || "QLD");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(t);
  }, [text]);
  const effWh = user?.role === "manager" ? user.warehouse_id! : wh;
  const res = useApi<any[]>(`/products?warehouse_id=${effWh}&q=${encodeURIComponent(q)}`);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <View style={s.root} testID="stock-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Row style={{ paddingHorizontal: spacing.lg, justifyContent: "space-between" }}>
          <H1>Stock</H1>
          <IconButton testID="stock-scan-button" icon="qrcode-scan" onPress={() => router.push("/scan")} />
        </Row>
        <View style={s.search}>
          <Icon name="magnify" size={24} color={colors.muted} />
          <TextInput testID="stock-search-input" style={s.input} value={text} onChangeText={setText} placeholder="Search SKU, name or description" placeholderTextColor={colors.muted} autoCapitalize="characters" returnKeyType="search" />
          {!!text && <IconButton testID="stock-search-clear" icon="close" onPress={() => setText("")} />}
        </View>
        {user?.role !== "manager" ? (
          <ChipRow testIDPrefix="stock-wh" value={wh} onChange={setWh} options={[{ label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
        ) : <Label style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>{effWh} warehouse</Label>}
      </View>
      {res.isLoading ? <Loading /> : res.isError ? <ErrorState message={(res.error as Error).message} onRetry={res.refetch} /> : (
        <FlatList
          data={res.data}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: bottomChrome + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={res.isRefetching} onRefresh={res.refetch} />}
          ListHeaderComponent={
            !q ? (
              <View style={{ marginBottom: spacing.sm }}>
                <CommonItems wh={effWh} onPick={(p) => router.push({ pathname: "/product/[id]", params: { id: p.id, wh: effWh } })} />
              </View>
            ) : (res.data?.length ?? 0) < 3 ? (
              <DidYouMean q={q} wh={effWh} show onPick={(t) => setText(t)} testID="stock-did-you-mean" />
            ) : null
          }
          ListEmptyComponent={<EmptyState icon="package-variant-remove" title="No products found" text="Try another SKU or keyword" />}
          renderItem={({ item: p }) => {
            const total = p.totals[effWh] || 0;
            const low = total <= p.reorder_level;
            return (
              <Card testID={`product-card-${p.sku}`} onPress={() => router.push({ pathname: "/product/[id]", params: { id: p.id, wh: effWh } })}>
                <Row style={{ alignItems: "flex-start" }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Mono>{p.sku}</Mono>
                    <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{p.name}</Body>
                    <Body numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{p.description}</Body>
                    <Label>{p.locations.map((l: any) => `${l.bin_code} (${l.qty})`).join(" · ") || "No bin assigned"}</Label>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Body style={[s.qty, low && { color: colors.error }]}>{total}</Body>
                    <Label>{p.unit}</Label>
                    {low && <StatusPill status="low" label="Low" />}
                  </View>
                </Row>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
