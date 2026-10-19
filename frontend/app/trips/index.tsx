import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { Body, Card, ChipRow, EmptyState, ErrorState, H3, Header, IconButton, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { fonts, makeStyles, radius, spacing, ThemeColors, useTheme } from "@/src/theme";

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const tone = (c: ThemeColors, s: string) =>
  s === "approved" ? c.success : s === "prepared" ? c.info : s === "issued" ? c.muted : s === "rejected" || s === "cancelled" ? c.error : c.warning;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.md },
  cell: { width: `${100 / 7}%`, height: 58, padding: 3 },
  cellInner: { flex: 1, borderRadius: radius.sm, backgroundColor: c.surfaceSecondary, padding: 4, gap: 2, borderWidth: 1, borderColor: c.border },
  dayNum: { fontFamily: fonts.displaySemi, fontSize: 15, color: c.onSurface },
  bar: { height: 5, borderRadius: 3 },
}));

export default function TripsCalendar() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(ymd(new Date()));
  const [status, setStatus] = useState("all");

  const days = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);
  const range = `start=${ymd(days[0])}&end=${ymd(days[41])}`;
  const q = useApi<any[]>(`/trips?${range}&status=${status}`);
  const trips = q.data || [];
  const on = (d: string) => trips.filter((t) => t.start_date <= d && t.end_date >= d);
  const dayTrips = on(sel);
  const today = ymd(new Date());

  return (
    <View style={s.root} testID="trips-screen">
      <Header title="Trip calendar" subtitle={user?.role === "driller" ? "Your planned trips" : "Planned driller trips"}
        right={<IconButton testID="trips-new-button" icon="plus" onPress={() => router.push({ pathname: "/trips/new", params: { date: sel } })} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={q.refetch} />}>
        <ChipRow testIDPrefix="trips-filter" value={status} onChange={setStatus}
          options={[{ label: "All", value: "all" }, { label: "Pending", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Prepared", value: "prepared" }, { label: "Issued", value: "issued" }]} />
        <View style={s.monthBar}>
          <IconButton testID="trips-prev-month" icon="chevron-left" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
          <H3 testID="trips-month-label">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</H3>
          <IconButton testID="trips-next-month" icon="chevron-right" onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
        </View>
        <View style={s.grid}>
          {DOW.map((d, i) => <View key={i} style={[s.cell, { height: 24, alignItems: "center" }]}><Label>{d}</Label></View>)}
          {days.map((d) => {
            const key = ymd(d);
            const list = on(key);
            const inMonth = d.getMonth() === cursor.getMonth();
            const selected = key === sel;
            return (
              <Pressable key={key} testID={`trips-day-${key}`} style={s.cell} onPress={() => setSel(key)}>
                <View style={[s.cellInner, !inMonth && { opacity: 0.35 }, key === today && { borderColor: colors.brandPrimary },
                  selected && { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary, borderWidth: 2 }]}>
                  <Body style={s.dayNum}>{d.getDate()}</Body>
                  {list.slice(0, 3).map((t) => <View key={t.id} style={[s.bar, { backgroundColor: tone(colors, t.status) }]} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Label>{new Date(sel + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</Label>
          {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : dayTrips.length === 0 ? (
            <EmptyState icon="calendar-blank" title="No trips this day" text="Tap + to plan a trip and list the stock you need" />
          ) : dayTrips.map((t) => (
            <Card key={t.id} testID={`trip-card-${t.number}`} onPress={() => router.push({ pathname: "/trips/[id]", params: { id: t.id } })}
              style={{ gap: 4, borderLeftWidth: 4, borderLeftColor: tone(colors, t.status) }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{t.number}</Mono>
                <StatusPill status={t.status} />
              </Row>
              <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{t.driller_name} · {t.rig_number}</Body>
              <Label>{t.start_date} → {t.end_date} · {t.warehouse_id}{t.site ? ` · ${t.site}` : ""} · {t.items.length} item(s)</Label>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
