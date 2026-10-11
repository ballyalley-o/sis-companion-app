import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/src/hooks";
import { Body, Card, EmptyState, ErrorState, Header, IconButton, Label, Mono, Row, StatusPill, Loading } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Kits() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useApi<any[]>("/kits");

  return (
    <View style={s.root} testID="kits-screen">
      <Header title="Rig kits" subtitle="One-tap standard requests" right={<IconButton testID="kits-new-button" icon="plus" onPress={() => router.push({ pathname: "/kit/[id]", params: { id: "new" } })} />} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <FlatList data={q.data} keyExtractor={(k) => k.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={q.refetch} />}
          ListEmptyComponent={<EmptyState icon="package-variant-plus" title="No rig kits yet" text="Create a standard kit so drillers can request everything in one go" />}
          renderItem={({ item: k }) => (
            <Card testID={`kit-card-${k.id}`} onPress={() => router.push({ pathname: "/kit/[id]", params: { id: k.id } })} style={{ gap: spacing.sm }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{k.rig_number}</Mono>
                <Row style={{ gap: spacing.sm }}>
                  <Label>{k.warehouse_id}</Label>
                  {k.short > 0 && <StatusPill status="low" label={`${k.short} short`} />}
                </Row>
              </Row>
              <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{k.name}</Body>
              <Body style={{ fontSize: 13 }} numberOfLines={2}>{k.items.map((i: any) => `${i.sku}×${i.qty}`).join(", ")}</Body>
            </Card>
          )} />
      )}
    </View>
  );
}
