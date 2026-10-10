import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, Chip, ChipRow, EmptyState, ErrorState, Field, H3, Header, IconButton, Label, Loading, Mono, Row, Sheet, StatusPill, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Counts() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useApi<any[]>("/counts");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"stocktake" | "cycle">("cycle");
  const [wh, setWh] = useState(user?.warehouse_id || "QLD");
  const [name, setName] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const bins = useApi<any[]>(open ? `/bins?warehouse_id=${wh}` : null);

  const create = async () => {
    setBusy(true);
    try {
      const c = await api("/counts", { method: "POST", body: { warehouse_id: wh, type, bin_ids: type === "cycle" ? sel : [], name } });
      qc.invalidateQueries();
      setOpen(false);
      setSel([]);
      router.push({ pathname: "/counts/[id]", params: { id: c.id } });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root} testID="counts-screen">
      <Header title="Counts" subtitle="Stocktakes & cycle counts" right={<IconButton testID="counts-new-button" icon="plus" onPress={() => setOpen(true)} />} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <FlatList data={q.data} keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={q.refetch} />}
          ListEmptyComponent={<EmptyState icon="clipboard-check-outline" title="No counts yet" text="Start a cycle count on a few bins or a full stocktake" />}
          renderItem={({ item: c }) => (
            <Card testID={`count-card-${c.number}`} onPress={() => router.push({ pathname: "/counts/[id]", params: { id: c.id } })} style={{ gap: spacing.sm }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{c.number}</Mono>
                <StatusPill status={c.status} />
              </Row>
              <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{c.name} · {c.warehouse_id}</Body>
              <Label>{c.progress}/{c.total} counted · {c.variances} variance(s) · {fmtDate(c.created_at)}</Label>
            </Card>
          )} />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} testID="new-count-sheet">
        <H3>New count</H3>
        <Row>
          <Chip testID="count-type-cycle" label="Cycle count" selected={type === "cycle"} onPress={() => setType("cycle")} />
          <Chip testID="count-type-stocktake" label="Full stocktake" selected={type === "stocktake"} onPress={() => setType("stocktake")} />
        </Row>
        {user?.role === "admin" && (
          <View style={{ marginHorizontal: -spacing.xl }}>
            <ChipRow testIDPrefix="count-wh" value={wh} onChange={(v) => { setWh(v); setSel([]); }} options={[{ label: "QLD", value: "QLD" }, { label: "NSW", value: "NSW" }]} />
          </View>
        )}
        <Field testID="count-name-input" placeholder="Name (optional)" value={name} onChangeText={setName} />
        {type === "cycle" && (
          <View style={{ gap: spacing.sm }}>
            <Label>Select bins ({sel.length})</Label>
            <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
              {(bins.data || []).map((b) => (
                <Chip key={b.id} testID={`count-bin-${b.code}`} label={b.code} selected={sel.includes(b.id)}
                  onPress={() => setSel(sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id])} />
              ))}
            </Row>
          </View>
        )}
        <Button testID="count-create-button" title="Start count" icon="play" loading={busy} disabled={type === "cycle" && sel.length === 0} onPress={create} />
      </Sheet>
    </View>
  );
}
