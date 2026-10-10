import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { Body, Button, Card, ChipRow, EmptyState, ErrorState, Field, H3, Header, IconButton, Label, Loading, Mono, Row, Sheet, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, chips: { borderBottomWidth: 1, borderBottomColor: c.divider } }));

function labelsHtml(labels: any[]) {
  // Printed labels are always black-on-white for scanner contrast.
  const cells = labels.map((l) => `
    <div class="l"><img src="${l.data_uri}"/><div><div class="c">${l.code}</div><div class="w">${l.warehouse_id} · ${l.zone}</div><div class="d">${l.description}</div></div></div>`).join("");
  return `<html><head><style>
    body{font-family:Arial,Helvetica,sans-serif;margin:12px}
    .g{display:flex;flex-wrap:wrap;gap:10px}
    .l{width:46%;border:3px solid #000;border-radius:8px;padding:8px;display:flex;align-items:center;gap:10px;page-break-inside:avoid}
    img{width:120px;height:120px}
    .c{font-size:28px;font-weight:900;letter-spacing:1px}.w{font-size:14px;font-weight:700}.d{font-size:12px}
  </style></head><body><div class="g">${cells}</div></body></html>`;
}

export default function Bins() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [wh, setWh] = useState(user?.warehouse_id || "QLD");
  const q = useApi<any[]>(`/bins?warehouse_id=${wh}`);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [zone, setZone] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  const print = async (ids?: string) => {
    setPrinting(true);
    try {
      const labels = await api<any[]>(`/bins-labels?warehouse_id=${wh}${ids ? `&ids=${ids}` : ""}`);
      await Print.printAsync({ html: labelsHtml(labels) });
    } catch (e: any) {
      toast(e.message || "Print failed", "error");
    } finally {
      setPrinting(false);
    }
  };
  const create = async () => {
    if (!code.trim()) return toast("Enter a bin code", "error");
    setBusy(true);
    try {
      await api("/bins", { method: "POST", body: { code, warehouse_id: wh, zone, description: desc } });
      toast(`Bin ${code.toUpperCase()} created`);
      setOpen(false); setCode(""); setZone(""); setDesc("");
      qc.invalidateQueries();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const archive = async (b: any) => {
    try {
      await api(`/bins/${b.id}`, { method: "DELETE" });
      toast(`Bin ${b.code} archived`, "info");
      qc.invalidateQueries();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={s.root} testID="bins-screen">
      <Header title="Bins" subtitle="Locations & QR labels" right={<IconButton testID="bins-new-button" icon="plus" onPress={() => setOpen(true)} />} />
      {user?.role === "admin" && (
        <View style={s.chips}>
          <ChipRow testIDPrefix="bins-wh" value={wh} onChange={setWh} options={[{ label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
        </View>
      )}
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <FlatList data={q.data} keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={q.refetch} />}
          ListHeaderComponent={<Button testID="bins-print-all" title={`Print all ${wh} labels`} icon="printer" loading={printing} onPress={() => print()} />}
          ListEmptyComponent={<EmptyState icon="grid-off" title="No bins" />}
          renderItem={({ item: b }) => (
            <Card testID={`bin-card-${b.code}`} onPress={() => router.push({ pathname: "/bin/[id]", params: { id: b.id } })}>
              <Row>
                <View style={{ flex: 1, gap: 2 }}>
                  <Mono>{b.code}</Mono>
                  <Body>{b.zone} · {b.description}</Body>
                  <Label>{b.sku_count} SKU(s)</Label>
                </View>
                <IconButton testID={`bin-print-${b.code}`} icon="printer" onPress={() => print(b.id)} />
                <IconButton testID={`bin-archive-${b.code}`} icon="archive-arrow-down-outline" onPress={() => archive(b)} />
              </Row>
            </Card>
          )} />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} testID="new-bin-sheet">
        <H3>New bin · {wh}</H3>
        <Field testID="bin-code-input" label="Bin code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder={`${wh}-D01`} />
        <Field testID="bin-zone-input" label="Zone" value={zone} onChangeText={setZone} placeholder="Aisle D" />
        <Field testID="bin-desc-input" label="Description" value={desc} onChangeText={setDesc} placeholder="Pallet racking level 1" />
        <Button testID="bin-create-button" title="Create bin" icon="plus" loading={busy} onPress={create} />
      </Sheet>
    </View>
  );
}
