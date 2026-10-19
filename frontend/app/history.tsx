import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { DidYouMean } from "@/src/suggest";
import { Body, Card, ChipRow, EmptyState, ErrorState, H3, Header, Icon, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  search: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, paddingHorizontal: spacing.md, height: 56, gap: spacing.sm },
  input: { flex: 1, color: c.onSurface, fontFamily: fonts.text, fontSize: 17, height: 56 },
  row: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
}));

const LABEL: Record<string, string> = {
  request_take: "Taken by driller", request_return: "Returned", receive: "Received", count_adjust: "Count adjustment", zoho_sync: "Zoho import sync",
};

export default function StockHistory() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const p = useLocalSearchParams<{ product_id?: string }>();
  const [pid, setPid] = useState(p.product_id || "");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [wh, setWh] = useState(user?.role === "manager" ? user.warehouse_id! : "ALL");
  useEffect(() => { const t = setTimeout(() => setQ(text), 300); return () => clearTimeout(t); }, [text]);
  const results = useApi<any[]>(!pid && q.trim().length >= 2 ? `/products?q=${encodeURIComponent(q.trim())}` : null);
  const trace = useApi<any>(pid ? `/products/${pid}/trace${wh !== "ALL" ? `?warehouse_id=${wh}` : ""}` : null);
  const d = trace.data;

  const openRef = (ref: any) => {
    if (!ref) return;
    if (ref.type === "request") router.push({ pathname: "/request/[id]", params: { id: ref.id } });
    else if (ref.type === "count") router.push({ pathname: "/counts/[id]", params: { id: ref.id } });
  };

  return (
    <View style={s.root} testID="history-screen">
      <Header title="Stock history" subtitle="Trace every movement of an item" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        {!pid ? (
          <>
            <View style={s.search}>
              <Icon name="magnify" size={24} color={colors.muted} />
              <TextInput testID="history-search-input" style={s.input} value={text} onChangeText={setText} placeholder="Search SKU or name" placeholderTextColor={colors.muted} autoCapitalize="characters" />
            </View>
            <DidYouMean q={q} show={!results.isLoading && (results.data?.length ?? 0) < 2} onPick={(t) => setText(t)} testID="history-did-you-mean" />
            {(results.data || []).map((prod) => (
              <Card key={prod.id} testID={`history-pick-${prod.sku}`} onPress={() => setPid(prod.id)}>
                <Mono>{prod.sku}</Mono>
                <Body>{prod.name}</Body>
              </Card>
            ))}
            {!q && <EmptyState icon="timeline-text-outline" title="Pick an item" text="Search an item to see every take, return, receipt, count and Zoho sync" />}
          </>
        ) : trace.isLoading ? <Loading /> : trace.isError ? <ErrorState message={(trace.error as Error).message} onRetry={trace.refetch} /> : d && (
          <>
            <Card style={{ gap: spacing.sm }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{d.product.sku}</Mono>
                <Pressable testID="history-change-item" onPress={() => { setPid(""); setText(""); }} hitSlop={10}><Label style={{ color: colors.brandPrimary }}>Change item</Label></Pressable>
              </Row>
              <H3>{d.product.name}</H3>
              <Row>
                {Object.entries(d.product.totals).map(([w, n]: any) => (
                  <Card key={w} style={{ flex: 1, backgroundColor: colors.surfaceTertiary }}><Label>{w} on hand</Label><Body testID={`history-total-${w}`} style={{ fontSize: 26, fontWeight: "800", color: colors.onSurface }}>{n}</Body></Card>
                ))}
              </Row>
            </Card>
            {user?.role !== "manager" && (
              <View style={{ marginHorizontal: -spacing.lg }}>
                <ChipRow testIDPrefix="history-wh" value={wh} onChange={setWh} options={[{ label: "All", value: "ALL" }, { label: "QLD", value: "QLD" }, { label: "NSW", value: "NSW" }]} />
              </View>
            )}

            {(d.reservations.length > 0 || d.reorders.length > 0) && (
              <Card style={{ gap: spacing.sm }} testID="history-upcoming">
                <Label>Upcoming</Label>
                {d.reservations.map((r: any) => (
                  <Pressable key={r.trip_id} testID={`history-trip-${r.number}`} onPress={() => router.push({ pathname: "/trips/[id]", params: { id: r.trip_id } })}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Body style={{ flex: 1, color: colors.onSurface }}>Trip {r.number} · {r.start_date} · {r.driller_name} {r.rig_number}</Body>
                      <StatusPill status={r.status} label={`−${r.qty}`} />
                    </Row>
                  </Pressable>
                ))}
                {d.reorders.map((r: any) => (
                  <Row key={r.id} style={{ justifyContent: "space-between" }}>
                    <Body style={{ flex: 1, color: colors.onSurface }}>Reorder {r.number} · {r.warehouse_id}{r.needed_by ? ` · by ${r.needed_by}` : ""}</Body>
                    <StatusPill status="return" label={`+${r.qty}`} />
                  </Row>
                ))}
              </Card>
            )}

            <Card>
              <Label>Movements ({d.movements.length})</Label>
              {d.movements.length === 0 && <Body style={{ marginTop: spacing.sm }}>No movements yet.</Body>}
              {d.movements.map((m: any) => (
                <Pressable key={m.id} testID={`history-move-${m.id}`} style={s.row} onPress={() => openRef(m.ref)}>
                  <View style={[s.dot, { backgroundColor: m.delta < 0 ? colors.warning : colors.success }]} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{LABEL[m.type] || m.type} · {m.bin_code}</Body>
                    <Body style={{ fontSize: 13 }}>{m.driller_name || m.user_name}{m.rig_number ? ` · ${m.rig_number}` : ""}{m.ref?.number ? ` · ${m.ref.number}` : ""}{m.note ? ` · ${m.note}` : ""}</Body>
                    <Label>{fmtDate(m.at)} · {m.warehouse_id} · balance {m.balance_after}</Label>
                  </View>
                  <Body style={{ fontSize: 20, fontWeight: "800", color: m.delta < 0 ? colors.warning : colors.success }}>{m.delta > 0 ? `+${m.delta}` : m.delta}</Body>
                </Pressable>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}
