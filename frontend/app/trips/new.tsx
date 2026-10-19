import { useEffect, useMemo, useState } from "react";
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  footer: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  result: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, gap: spacing.md },
}));

export default function TripForm() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const p = useLocalSearchParams<{ date?: string; id?: string }>();
  const existing = useApi<any>(p.id ? `/trips/${p.id}` : null);
  const drillers = useApi<any[]>("/drillers");
  const rigs = useApi<any[]>("/rigs");
  const [wh, setWh] = useState<string>(user?.warehouse_id || "QLD");
  const [driller, setDriller] = useState(user?.role === "driller" ? user.name : "");
  const [rig, setRig] = useState("");
  const [site, setSite] = useState("");
  const [start, setStart] = useState(p.date || "");
  const [end, setEnd] = useState(p.date || "");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!p.id);
  const results = useApi<any[]>(search.trim().length >= 2 ? `/products?warehouse_id=${wh}&q=${encodeURIComponent(search.trim())}` : null);
  const kits = useApi<any[]>(rig ? `/kits?rig=${encodeURIComponent(rig)}&warehouse_id=${wh}` : null);

  useEffect(() => {
    const t = existing.data;
    if (t && !loaded) {
      setWh(t.warehouse_id); setDriller(t.driller_name); setRig(t.rig_number); setSite(t.site); setStart(t.start_date);
      setEnd(t.end_date); setNotes(t.notes);
      setItems(t.items.map((i: any) => ({ product_id: i.product_id, sku: i.sku, name: i.name, unit: i.unit, qty: i.qty })));
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  const drillerOpts = useMemo(() => {
    const names = (drillers.data || []).map((d) => d.name);
    if (user && !names.includes(user.name)) names.unshift(user.name);
    return names.map((n) => ({ label: n, value: n }));
  }, [drillers.data, user]);

  const add = (prod: any, qty = 1) => {
    setItems((cur) => cur.some((i) => i.product_id === prod.id || i.product_id === prod.product_id)
      ? cur : [...cur, { product_id: prod.id || prod.product_id, sku: prod.sku, name: prod.name, unit: prod.unit, qty }]);
    setSearch("");
  };

  const submit = async () => {
    if (!driller || !rig) return toast("Select driller and rig", "error");
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) return toast("Dates must be YYYY-MM-DD", "error");
    if (end < start) return toast("End date is before start date", "error");
    if (!items.length) return toast("Add the items you need", "error");
    setBusy(true);
    try {
      const body = { warehouse_id: wh, driller_name: driller, rig_number: rig, site, start_date: start, end_date: end, notes,
        items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })) };
      const r = await api(p.id ? `/trips/${p.id}` : "/trips", { method: p.id ? "PUT" : "POST", body });
      qc.invalidateQueries();
      toast(p.id ? "Trip updated — sent for approval" : `Trip ${r.number} sent for approval`);
      router.replace({ pathname: "/trips/[id]", params: { id: r.id } });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <View style={s.root}><Header title="Trip" /><Loading /></View>;

  return (
    <View style={s.root} testID="trip-form-screen">
      <Header title={p.id ? "Edit trip" : "Plan a trip"} subtitle="List stock in advance so we can prepare it" />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl }}>
        {user?.role !== "manager" && (
          <View style={{ gap: spacing.sm }}>
            <Label>Warehouse</Label>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow testIDPrefix="trip-wh" value={wh} onChange={setWh} options={[{ label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
            </View>
          </View>
        )}
        <View style={{ gap: spacing.sm }}>
          <Label>Driller</Label>
          <View style={{ marginHorizontal: -spacing.lg }}><ChipRow testIDPrefix="trip-driller" value={driller} onChange={setDriller} options={drillerOpts} /></View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Label>Rig</Label>
          <View style={{ marginHorizontal: -spacing.lg }}><ChipRow testIDPrefix="trip-rig" value={rig} onChange={setRig} options={(rigs.data || []).map((r) => ({ label: r.number, value: r.number }))} /></View>
        </View>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}><Field testID="trip-start-input" label="Start (YYYY-MM-DD)" value={start} onChangeText={setStart} placeholder="2026-07-01" keyboardType="numbers-and-punctuation" /></View>
          <View style={{ flex: 1 }}><Field testID="trip-end-input" label="End (YYYY-MM-DD)" value={end} onChangeText={setEnd} placeholder="2026-07-14" keyboardType="numbers-and-punctuation" /></View>
        </Row>
        <Field testID="trip-site-input" label="Site / project" value={site} onChangeText={setSite} placeholder="e.g. Mt Isa — Hole MI-204" />

        <View style={{ gap: spacing.md }}>
          <Label>Items needed ({items.length})</Label>
          {(kits.data || []).map((k) => (
            <Button key={k.id} testID={`trip-kit-${k.id}`} title={`Add kit: ${k.name}`} icon="package-variant-plus" variant="ghost"
              onPress={() => { k.items.forEach((i: any) => add(i, i.qty)); toast(`${k.name} added`); }} />
          ))}
          {items.map((it, i) => (
            <Card key={it.product_id} testID={`trip-item-${it.sku}`} style={{ gap: spacing.md }}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}><Mono>{it.sku}</Mono><Body style={{ color: colors.onSurface }}>{it.name}</Body></View>
                <IconButton testID={`trip-item-remove-${it.sku}`} icon="trash-can-outline" onPress={() => setItems(items.filter((_, j) => j !== i))} />
              </Row>
              <Stepper testID={`trip-item-qty-${it.sku}`} value={it.qty} onChange={(n) => setItems(items.map((x, j) => (j === i ? { ...x, qty: n } : x)))} />
            </Card>
          ))}
          {!search && <CommonItems wh={wh} rig={rig || undefined} onPick={(prod) => add(prod)} />}
          <Field testID="trip-search-input" value={search} onChangeText={setSearch} placeholder="Add item: search SKU or name" autoCapitalize="characters" />
          <DidYouMean q={search} wh={wh} show={!results.isLoading && (results.data?.length ?? 0) < 2} onPick={(t) => setSearch(t)} testID="trip-did-you-mean" />
          {(results.data || []).map((prod) => (
            <Pressable key={prod.id} testID={`trip-add-${prod.sku}`} style={s.result} onPress={() => add(prod)}>
              <View style={{ flex: 1 }}>
                <Body style={{ color: colors.onSurface, fontWeight: "700" }} numberOfLines={1}>{prod.sku} · {prod.name}</Body>
                <Label>{prod.totals?.[wh] || 0} {prod.unit} on hand</Label>
              </View>
              <Icon name="plus-circle" size={28} color={colors.brandPrimary} />
            </Pressable>
          ))}
        </View>
        <Field testID="trip-notes-input" label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Access, timing, special requests…" />
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="trip-submit-button" large title={p.id ? "Save & resubmit" : "Submit trip"} icon="calendar-check" loading={busy} onPress={submit} />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
