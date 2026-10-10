import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isStaff, useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Card, ChipRow, EmptyState, ErrorState, Header, Label, Loading, Mono, Row, StatusPill } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

type Tab = "low" | "disc" | "moves" | "audit";
const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, chips: { borderBottomWidth: 1, borderBottomColor: c.divider } }));
const PATH: Record<Tab, string> = { low: "/reports/low-stock", disc: "/reports/discrepancies", moves: "/movements", audit: "/audit" };

export default function Reports() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const staff = isStaff(user);
  const [tab, setTab] = useState<Tab>("low");
  const q = useApi<any[]>(PATH[tab]);
  const opts = [{ label: "Low stock", value: "low" as Tab }, { label: "Movements", value: "moves" as Tab },
    ...(staff ? [{ label: "Discrepancies", value: "disc" as Tab }, { label: "Audit trail", value: "audit" as Tab }] : [])];

  const render = ({ item: x }: { item: any }) => {
    if (tab === "low") return (
      <Card testID={`report-low-${x.sku}-${x.warehouse_id}`}>
        <Row>
          <View style={{ flex: 1 }}><Mono>{x.sku}</Mono><Body>{x.name}</Body><Label>{x.warehouse_id}</Label></View>
          <View style={{ alignItems: "flex-end" }}>
            <Body style={{ fontSize: 26, fontWeight: "800", color: colors.error }}>{x.qty}</Body>
            <Label>reorder {x.reorder_level}</Label>
          </View>
        </Row>
      </Card>
    );
    if (tab === "disc") return (
      <Card testID={`report-disc-${x.id}`}>
        <Row>
          <View style={{ flex: 1 }}><Mono>{x.sku}</Mono><Body>{x.name} · bin {x.bin_code}</Body><Label>{x.count_number} · {x.warehouse_id} · {fmtDate(x.at)} · {x.by}</Label></View>
          <View style={{ alignItems: "flex-end" }}>
            <Body style={{ fontSize: 24, fontWeight: "800", color: x.variance < 0 ? colors.error : colors.success }}>{x.variance > 0 ? "+" : ""}{x.variance}</Body>
            <Label>{x.expected} → {x.counted}</Label>
          </View>
        </Row>
      </Card>
    );
    if (tab === "moves") return (
      <Card>
        <Row>
          <View style={{ flex: 1 }}><Mono>{x.sku}</Mono><Body>{x.bin_code} · {x.driller_name || x.user_name}{x.rig_number ? ` · ${x.rig_number}` : ""}</Body><Label>{fmtDate(x.at)} · {x.type.replace("_", " ")} · {x.ref?.number}</Label></View>
          <StatusPill status={x.delta < 0 ? "take" : "return"} label={x.delta > 0 ? `+${x.delta}` : String(x.delta)} />
        </Row>
      </Card>
    );
    return (
      <Card>
        <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{x.action}</Body>
        <Body>{x.user_name} ({x.role}) · {x.entity}</Body>
        <Label>{fmtDate(x.at)}</Label>
      </Card>
    );
  };

  return (
    <View style={s.root} testID="reports-screen">
      <Header title="Reports" subtitle={user?.role === "manager" ? `${user.warehouse_id} warehouse` : "All warehouses"} />
      <View style={s.chips}><ChipRow testIDPrefix="reports-tab" value={tab} onChange={setTab} options={opts} /></View>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <FlatList data={q.data} keyExtractor={(x, i) => x.id || `${x.product_id}-${x.warehouse_id}-${i}`} renderItem={render}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={q.refetch} />}
          ListEmptyComponent={<EmptyState title="Nothing to report" />} />
      )}
    </View>
  );
}
