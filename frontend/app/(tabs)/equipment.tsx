import { useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { Body, Card, ChipRow, EmptyState, ErrorState, H1, IconButton, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

type F = "all" | "available" | "out" | "overdue" | "mine";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider, gap: spacing.xs },
}));

export default function Equipment() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: F }>();
  const { user } = useAuth();
  const [f, setF] = useState<F>(params.filter || "all");
  useEffect(() => { if (params.filter) setF(params.filter); }, [params.filter]);
  const res = useApi<any[]>(`/equipment${f !== "all" ? `?status=${f}` : ""}`);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <View style={s.root} testID="equipment-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Row style={{ paddingHorizontal: spacing.lg, justifyContent: "space-between" }}>
          <View>
            <H1>Equipment</H1>
            <Label>Borrow & return register{user?.role === "manager" ? ` · ${user.warehouse_id}` : ""}</Label>
          </View>
          <IconButton testID="equipment-scan-button" icon="qrcode-scan" onPress={() => router.push("/scan")} />
        </Row>
        <ChipRow testIDPrefix="equipment-filter" value={f} onChange={setF}
          options={[{ label: "All", value: "all" }, { label: "Available", value: "available" }, { label: "Signed out", value: "out" }, { label: "Overdue", value: "overdue" }, { label: "With me", value: "mine" }]} />
      </View>
      {res.isLoading ? <Loading /> : res.isError ? <ErrorState message={(res.error as Error).message} onRetry={res.refetch} /> : (
        <FlatList
          data={res.data}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: bottomChrome + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={res.isRefetching} onRefresh={res.refetch} />}
          ListEmptyComponent={<EmptyState icon="toolbox-outline" title="Nothing here" text="No equipment matches this filter" />}
          renderItem={({ item: e }) => (
            <Card testID={`equipment-card-${e.code}`} onPress={() => router.push({ pathname: "/equipment/[id]", params: { id: e.id } })}
              style={e.overdue ? { borderColor: colors.error, borderWidth: 2 } : undefined}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Mono>{e.code}</Mono>
                  <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{e.name}</Body>
                  <Label>{e.category} · {e.warehouse_id}</Label>
                  {e.current_loan && (
                    <Body style={{ fontSize: 13 }}>{e.current_loan.driller_name} · {e.current_loan.rig_number} · due {fmtDate(e.current_loan.due_at)}</Body>
                  )}
                </View>
                <StatusPill status={e.overdue ? "overdue" : e.status} />
              </Row>
            </Card>
          )}
        />
      )}
    </View>
  );
}
