import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { CommonItems, DidYouMean } from "@/src/suggest";
import { Body, Button, Card, ChipRow, Field, Header, Icon, IconButton, Label, Loading, Mono, Row, Stepper, useToast } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Item = { product_id: string; sku: string; name: string; unit: string; qty: number };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  footer: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  result: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, gap: spacing.md },
}));

export default function KitEditor() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const kit = useApi<any>(isNew ? null : `/kits/${id}`);
  const rigs = useApi<any[]>("/rigs");
  const [wh, setWh] = useState<string>(user?.warehouse_id || "QLD");
  const [rig, setRig] = useState("");
  const [name, setName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const results = useApi<any[]>(search.trim().length >= 2 ? `/products?warehouse_id=${wh}&q=${encodeURIComponent(search.trim())}` : null);

  useEffect(() => {
    if (kit.data && !loaded) {
      setWh(kit.data.warehouse_id); setRig(kit.data.rig_number); setName(kit.data.name);
      setItems(kit.data.items.map((i: any) => ({ product_id: i.product_id, sku: i.sku, name: i.name, unit: i.unit, qty: i.qty })));
      setLoaded(true);
    }
  }, [kit.data, loaded]);

  const add = (p: any) => {
    if (items.some((i) => i.product_id === p.id)) return toast(`${p.sku} already in kit`, "info");
    setItems([...items, { product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, qty: 1 }]);
    setSearch("");
  };

  const save = async () => {
    if (!rig) return toast("Select a rig", "error");
    if (!items.length) return toast("Add at least one item", "error");
    setBusy(true);
    try {
      const body = { name, rig_number: rig, warehouse_id: wh, items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })) };
      await api(isNew ? "/kits" : `/kits/${id}`, { method: isNew ? "POST" : "PUT", body });
      qc.invalidateQueries();
      toast(isNew ? "Kit created" : "Kit saved");
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api(`/kits/${id}`, { method: "DELETE" });
      qc.invalidateQueries();
      toast("Kit deleted", "info");
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  if (!loaded) return <View style={s.root}><Header title="Rig kit" /><Loading /></View>;

  return (
    <View style={s.root} testID="kit-editor-screen">
      <Header title={isNew ? "New rig kit" : "Edit kit"} subtitle={rig ? `${rig} · ${wh}` : wh}
        right={!isNew ? <IconButton testID="kit-delete-button" icon="trash-can-outline" onPress={remove} /> : undefined} />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl }}>
        {user?.role === "admin" && (
          <View style={{ gap: spacing.sm }}>
            <Label>Warehouse</Label>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow testIDPrefix="kit-wh" value={wh} onChange={setWh} options={[{ label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
            </View>
          </View>
        )}
        <View style={{ gap: spacing.sm }}>
          <Label>Rig</Label>
          <View style={{ marginHorizontal: -spacing.lg }}>
            <ChipRow testIDPrefix="kit-rig" value={rig} onChange={setRig} options={(rigs.data || []).map((r) => ({ label: r.number, value: r.number }))} />
          </View>
        </View>
        <Field testID="kit-name-input" label="Kit name" value={name} onChangeText={setName} placeholder="e.g. HQ weekly consumables" />
        <View style={{ gap: spacing.md }}>
          <Label>Items ({items.length})</Label>
          {items.map((it, i) => (
            <Card key={it.product_id} testID={`kit-item-${it.sku}`} style={{ gap: spacing.md }}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Mono>{it.sku}</Mono>
                  <Body style={{ color: colors.onSurface }}>{it.name}</Body>
                </View>
                <IconButton testID={`kit-item-remove-${it.sku}`} icon="trash-can-outline" onPress={() => setItems(items.filter((_, j) => j !== i))} />
              </Row>
              <Stepper testID={`kit-item-qty-${it.sku}`} value={it.qty} onChange={(n) => setItems(items.map((x, j) => (j === i ? { ...x, qty: n } : x)))} />
            </Card>
          ))}
          {!search && <CommonItems wh={wh} rig={rig || undefined} onPick={add} />}
          <Field testID="kit-search-input" value={search} onChangeText={setSearch} placeholder="Add item: search SKU or name" autoCapitalize="characters" />
          <DidYouMean q={search} wh={wh} show={!results.isLoading && (results.data?.length ?? 0) < 2} onPick={(t) => setSearch(t)} testID="kit-did-you-mean" />
          {(results.data || []).map((p) => (
            <Pressable key={p.id} testID={`kit-add-${p.sku}`} style={s.result} onPress={() => add(p)}>
              <Body style={{ flex: 1, color: colors.onSurface, fontWeight: "700" }} numberOfLines={1}>{p.sku} · {p.name}</Body>
              <Icon name="plus-circle" size={28} color={colors.brandPrimary} />
            </Pressable>
          ))}
        </View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="kit-save-button" large title="Save kit" icon="content-save" loading={busy} onPress={save} />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
