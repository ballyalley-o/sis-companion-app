import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isStaff, useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { Body, Button, Card, ChipRow, ErrorState, H1, H3, Icon, IconButton, IconName, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1562237553-fd52cb2067b6?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 190, justifyContent: "flex-end" },
  heroInner: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 2 },
  topRow: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg },
  tile: { width: "47.5%", minHeight: 112, borderRadius: radius.md, padding: spacing.lg, justifyContent: "space-between", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  tileText: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface, textTransform: "uppercase", letterSpacing: 0.5 },
  stats: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg },
  stat: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, gap: 2 },
  statNum: { fontFamily: fonts.display, fontSize: 34, color: c.onSurface },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  rowItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider, gap: spacing.md },
}));

function Tile({ icon, label, onPress, primary, testID }: { icon: IconName; label: string; onPress: () => void; primary?: boolean; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.tile, primary && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Icon name={icon} size={36} color={primary ? colors.onBrandPrimary : colors.brandPrimary} />
      <Body style={[s.tileText, primary && { color: colors.onBrandPrimary }]}>{label}</Body>
    </Pressable>
  );
}

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const staff = isStaff(user);
  const [wh, setWh] = useState<string>(user?.role === "admin" ? "ALL" : user?.warehouse_id || "ALL");
  const q = useApi<any>(`/dashboard${wh !== "ALL" && user?.role !== "manager" ? `?warehouse_id=${wh}` : ""}`);
  const unread = useApi<{ count: number }>("/notifications/unread-count");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const d = q.data;

  return (
    <View style={s.root} testID="dashboard-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl, gap: spacing.lg }}
        refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={() => { q.refetch(); unread.refetch(); }} />}>
        <View style={s.hero}>
          <Image source={{ uri: HERO }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
          <LinearGradient colors={["transparent", colors.scrim, colors.surface]} style={{ position: "absolute", width: "100%", height: "100%" }} />
          <View style={[s.topRow, { top: insets.top + spacing.sm }]}>
            <StatusPill status={d?.zoho_mode || "mock"} label={d?.zoho_mode === "live" ? "Zoho live" : "Zoho mock"} testID="dashboard-zoho-status" />
            <IconButton testID="dashboard-notifications-button" icon="bell" badge={unread.data?.count} onPress={() => router.push("/notifications")} />
          </View>
          <View style={s.heroInner}>
            <Label>{user?.role === "driller" ? "Driller" : user?.role === "manager" ? `${user.warehouse_id} Manager` : "Admin · all warehouses"}</Label>
            <H1 testID="dashboard-user-name">{user?.name}</H1>
          </View>
        </View>

        {user?.role !== "manager" && (
          <ChipRow testIDPrefix="dashboard-wh" value={wh} onChange={setWh}
            options={[{ label: "All sites", value: "ALL" }, { label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
        )}

        <View style={s.grid}>
          <Tile testID="quick-scan-bin" icon="qrcode-scan" label="Scan bin" primary onPress={() => router.push("/scan")} />
          <Tile testID="quick-search-stock" icon="magnify" label="Search stock" onPress={() => router.push("/(tabs)/stock")} />
          <Tile testID="quick-equipment" icon="tools" label="Equipment" onPress={() => router.push("/(tabs)/equipment")} />
          {staff ? (
            <Tile testID="quick-counts" icon="clipboard-check-outline" label="Counts" onPress={() => router.push("/counts")} />
          ) : (
            <Tile testID="quick-my-requests" icon="clipboard-list-outline" label="My requests" onPress={() => router.push("/requests")} />
          )}
        </View>

        {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : d && (
          <>
            <View style={s.stats}>
              <Pressable testID="stat-pending" style={[s.stat, { borderLeftColor: colors.warning }]} onPress={() => router.push("/requests")}>
                <Body style={s.statNum}>{d.pending_requests}</Body><Label>{staff ? "To approve" : "Pending"}</Label>
              </Pressable>
              <Pressable testID="stat-low-stock" style={[s.stat, { borderLeftColor: colors.error }]} onPress={() => router.push("/reports")}>
                <Body style={s.statNum}>{d.low_stock_count}</Body><Label>Low stock</Label>
              </Pressable>
              <Pressable testID="stat-overdue" style={[s.stat, { borderLeftColor: d.equipment_overdue ? colors.error : colors.success }]} onPress={() => router.push({ pathname: "/(tabs)/equipment", params: { filter: "overdue" } })}>
                <Body style={s.statNum}>{d.equipment_overdue}</Body><Label>Overdue</Label>
              </Pressable>
            </View>

            {staff && d.pending_requests > 0 && (
              <View style={{ paddingHorizontal: spacing.lg }}>
                <Button testID="dashboard-review-approvals" title={`Review ${d.pending_requests} request${d.pending_requests > 1 ? "s" : ""}`} icon="gavel" onPress={() => router.push("/requests")} />
              </View>
            )}

            <View style={s.section}>
              <Row style={{ justifyContent: "space-between" }}>
                <H3>Low-stock alerts</H3>
                <Pressable testID="dashboard-see-low-stock" onPress={() => router.push("/reports")} hitSlop={10}><Label style={{ color: colors.brandPrimary }}>See all</Label></Pressable>
              </Row>
              <Card>
                {d.low_stock.length === 0 ? (
                  <Row><Icon name="check-decagram" size={28} color={colors.success} /><Body>All systems go — stock above reorder levels.</Body></Row>
                ) : d.low_stock.map((x: any, i: number) => (
                  <View key={x.product_id + x.warehouse_id} style={[s.rowItem, i === d.low_stock.length - 1 && { borderBottomWidth: 0 }]} testID={`low-stock-item-${x.sku}`}>
                    <View style={{ flex: 1 }}>
                      <Mono>{x.sku}</Mono>
                      <Body numberOfLines={1}>{x.name}</Body>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <StatusPill status="low" label={`${x.qty} / ${x.reorder_level}`} />
                      <Label>{x.warehouse_id}</Label>
                    </View>
                  </View>
                ))}
              </Card>
            </View>

            <View style={s.section}>
              <H3>Equipment</H3>
              <Row>
                <Card style={{ flex: 1 }}><Body style={s.statNum}>{d.equipment_available}</Body><Label>Available</Label></Card>
                <Card style={{ flex: 1 }}><Body style={s.statNum}>{d.equipment_out}</Body><Label>Signed out</Label></Card>
                <Card style={{ flex: 1 }}><Body style={s.statNum}>{d.my_equipment_out}</Body><Label>With me</Label></Card>
              </Row>
            </View>

            <View style={s.section}>
              <H3>Recent movements</H3>
              <Card>
                {d.recent_movements.length === 0 ? <Body>No stock movements yet.</Body> : d.recent_movements.map((m: any, i: number) => (
                  <View key={m.id} style={[s.rowItem, i === d.recent_movements.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Body style={{ color: colors.onSurface, fontWeight: "700" }} numberOfLines={1}>{m.sku} · {m.bin_code}</Body>
                      <Label>{fmtDate(m.at)} · {m.driller_name || m.user_name}</Label>
                    </View>
                    <Mono style={{ color: m.delta < 0 ? colors.warning : colors.success }}>{m.delta > 0 ? `+${m.delta}` : m.delta}</Mono>
                  </View>
                ))}
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
