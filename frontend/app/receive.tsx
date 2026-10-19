import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, uid } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { CommonItems, DidYouMean } from "@/src/suggest";
import { Body, Button, Card, ChipRow, Field, Header, Icon, IconButton, Label, Mono, Row, Stepper, useToast } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Line = { product_id: string; sku: string; name: string; unit: string; bin_id: string; qty: number };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  footer: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  result: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, gap: spacing.md },
}));

export default function Receive() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const p = useLocalSearchParams<{ wh?: string; bin_id?: string; reorder_id?: string }>();
  const [wh, setWh] = useState<string>(user?.role === "manager" ? user.warehouse_id! : p.wh || "QLD");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const clientRef = useRef(uid());
  const bins = useApi<any[]>(`/bins?warehouse_id=${wh}`);
  const results = useApi<any[]>(search.trim().length >= 2 ? `/products?warehouse_id=${wh}&q=${encodeURIComponent(search.trim())}` : null);
  const binOpts = (bins.data || []).map((b) => ({ label: b.code, value: b.id }));
  const reorder = useApi<any>(p.reorder_id ? `/reorders/${p.reorder_id}` : null);
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!reorder.data || !bins.data || prefilled) return;
    const r = reorder.data;
    (async () => {
      const out: Line[] = [];
      for (const i of r.items) {
        const left = i.qty - (i.received || 0);
        if (left <= 0) continue;
        const prod = await api(`/products/${i.product_id}`).catch(() => null);
        const home = prod?.locations?.find((l: any) => l.warehouse_id === r.warehouse_id);
        const bin_id = home?.bin_id || bins.data?.[0]?.id;
        if (bin_id) out.push({ product_id: i.product_id, sku: i.sku, name: i.name, unit: i.unit, bin_id, qty: left });
      }
      setLines(out);
      setSupplier(r.supplier || "");
      setReference(r.number);
      setPrefilled(true);
    })();
  }, [reorder.data, bins.data, prefilled]);

  const add = (prod: any) => {
    if (lines.some((l) => l.product_id === prod.id)) return toast(`${prod.sku} already added`, "info");
    const home = prod.locations?.find((l: any) => l.warehouse_id === wh);
    const bin_id = p.bin_id || home?.bin_id || bins.data?.[0]?.id;
    if (!bin_id) return toast("Create a bin in this warehouse first", "error");
    setLines([...lines, { product_id: prod.id, sku: prod.sku, name: prod.name, unit: prod.unit, bin_id, qty: 1 }]);
    setSearch("");
  };

  const submit = async () => {
    if (!lines.length) return toast("Add at least one item", "error");
    setBusy(true);
    try {
      const r = await api("/receipts", { method: "POST", body: {
        warehouse_id: wh, supplier, reference, notes, client_ref: clientRef.current, reorder_id: p.reorder_id || null,
        items: lines.map((l) => ({ product_id: l.product_id, bin_id: l.bin_id, qty: l.qty })) } });
      qc.invalidateQueries();
      toast(`${r.number} received · Zoho ${r.zoho_txn_id}`);
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root} testID="receive-screen">
      <Header title="Receive stock" subtitle={`Goods in · ${wh} warehouse`} />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl }}>
        {user?.role === "admin" && (
          <View style={{ gap: spacing.sm }}>
            <Label>Warehouse</Label>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow testIDPrefix="receive-wh" value={wh} onChange={(v) => { setWh(v); setLines([]); }} options={[{ label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
            </View>
          </View>
        )}
        <Field testID="receive-supplier-input" label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="e.g. Boart Longyear" />
        <Field testID="receive-reference-input" label="PO / delivery docket #" value={reference} onChangeText={setReference} autoCapitalize="characters" placeholder="PO-10452" />

        <View style={{ gap: spacing.md }}>
          <Label>Items received ({lines.length})</Label>
          {lines.map((l, i) => (
            <Card key={l.product_id} testID={`receive-line-${l.sku}`} style={{ gap: spacing.md }}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Mono>{l.sku}</Mono>
                  <Body style={{ color: colors.onSurface }}>{l.name}</Body>
                </View>
                <IconButton testID={`receive-line-remove-${l.sku}`} icon="trash-can-outline" onPress={() => setLines(lines.filter((_, j) => j !== i))} />
              </Row>
              <Label>Put away to bin</Label>
              <View style={{ marginHorizontal: -spacing.lg }}>
                <ChipRow testIDPrefix={`receive-bin-${l.sku}`} value={l.bin_id} options={binOpts}
                  onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, bin_id: v } : x)))} />
              </View>
              <Stepper testID={`receive-line-qty-${l.sku}`} value={l.qty} onChange={(n) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: n } : x)))} />
            </Card>
          ))}
          {!search && <CommonItems wh={wh} kind="receive" title="Commonly received" onPick={add} />}
          <Field testID="receive-search-input" value={search} onChangeText={setSearch} placeholder="Add item: search SKU or name" autoCapitalize="characters" />
          <DidYouMean q={search} wh={wh} show={!results.isLoading && (results.data?.length ?? 0) < 2} onPick={(t) => setSearch(t)} testID="receive-did-you-mean" />
          {(results.data || []).map((prod) => (
            <Pressable key={prod.id} testID={`receive-add-${prod.sku}`} style={s.result} onPress={() => add(prod)}>
              <View style={{ flex: 1 }}>
                <Body style={{ color: colors.onSurface, fontWeight: "700" }} numberOfLines={1}>{prod.sku} · {prod.name}</Body>
                <Label>{prod.totals?.[wh] || 0} {prod.unit} on hand</Label>
              </View>
              <Icon name="plus-circle" size={28} color={colors.brandPrimary} />
            </Pressable>
          ))}
        </View>
        <Field testID="receive-notes-input" label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Back-orders, damaged cartons…" />
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="receive-submit-button" large title="Receive into stock" icon="truck-check" variant="success" loading={busy} onPress={submit} />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
