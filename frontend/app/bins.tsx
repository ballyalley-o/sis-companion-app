import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { printLabels } from "@/src/label";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { Body, Button, Card, ChipRow, EmptyState, ErrorState, Field, H3, Header, IconButton, Label, Loading, Mono, Row, Sheet, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, chips: { borderBottomWidth: 1, borderBottomColor: c.divider } }));

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
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  const print = async (ids?: string) => {
    setPrinting(true);
    try {
      const labels = await api<any[]>(`/bins-labels?warehouse_id=${wh}${ids ? `&ids=${ids}` : ""}`);
      await printLabels(labels);
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
      await api("/bins", { method: "POST", body: { code, warehouse_id: wh, zone, description: desc, name } });
      toast(`Bin ${code.toUpperCase()} created`);
      setOpen(false); setCode(""); setZone(""); setDesc(""); setName("");
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
          ListHeaderComponent={<Button testID="bins-print-all" title={`Print all ${wh} labels (100×30mm)`} icon="printer" loading={printing} onPress={() => print()} />}
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
        <Field testID="bin-code-input" label="Bin code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="SEC1-L2-B22" />
        <Field testID="bin-name-input" label="Label title (optional)" value={name} onChangeText={setName} autoCapitalize="characters" placeholder="BIN 22" />
        <Field testID="bin-zone-input" label="Zone" value={zone} onChangeText={setZone} placeholder="Aisle D" />
        <Field testID="bin-desc-input" label="Description" value={desc} onChangeText={setDesc} placeholder="Pallet racking level 1" />
        <Button testID="bin-create-button" title="Create bin" icon="plus" loading={busy} onPress={create} />
      </Sheet>
    </View>
  );
}
