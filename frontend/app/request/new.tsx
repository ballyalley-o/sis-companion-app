import { useEffect, useMemo, useRef, useState } from "react";
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

type Line = { product_id: string; sku: string; name: string; unit: string; bin_id: string; bin_code: string; qty: number; avail: number };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  section: { gap: spacing.sm },
  typeBtn: { flex: 1, minHeight: 72, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center", gap: 2 },
  footer: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  result: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, gap: spacing.md },
}));

export default function NewRequest() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const p = useLocalSearchParams<{ type?: string; wh?: string; bin_id?: string; product_id?: string }>();
  const [type, setType] = useState<"take" | "return">(p.type === "return" ? "return" : "take");
  const [wh, setWh] = useState<string>(p.wh || user?.warehouse_id || "QLD");
  const [driller, setDriller] = useState(user?.role === "driller" ? user.name : "");
  const [rig, setRig] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const clientRef = useRef(uid());
  const drillers = useApi<any[]>("/drillers");
  const rigs = useApi<any[]>("/rigs");
  const kits = useApi<any[]>(rig ? `/kits?rig=${encodeURIComponent(rig)}&warehouse_id=${wh}` : null);
  const results = useApi<any[]>(search.trim().length >= 2 ? `/products?warehouse_id=${wh}&q=${encodeURIComponent(search.trim())}` : null);

  useEffect(() => {
    if (!p.bin_id || !p.product_id) return;
    api(`/bins/${p.bin_id}`).then((b) => {
      const it = b.items.find((x: any) => x.product_id === p.product_id);
      if (it) setLines([{ product_id: it.product_id, sku: it.sku, name: it.name, unit: it.unit, bin_id: b.id, bin_code: b.code, qty: 1, avail: it.qty }]);
    }).catch(() => {});
  }, [p.bin_id, p.product_id]);

  const drillerOpts = useMemo(() => {
    const names = (drillers.data || []).map((d) => d.name);
    if (user && !names.includes(user.name)) names.unshift(user.name);
    return names.map((n) => ({ label: n, value: n }));
  }, [drillers.data, user]);

  const addLine = (prod: any, loc: any) => {
    if (lines.some((l) => l.product_id === prod.id && l.bin_id === loc.bin_id)) return toast("Already in this request", "info");
    setLines([...lines, { product_id: prod.id, sku: prod.sku, name: prod.name, unit: prod.unit, bin_id: loc.bin_id, bin_code: loc.bin_code, qty: 1, avail: loc.qty }]);
    setSearch("");
  };

  const applyKit = (k: any) => {
    const next = [...lines];
    const skipped: string[] = [];
    for (const it of k.items) {
      if (!it.bin_id || it.avail <= 0) { skipped.push(it.sku); continue; }
      const qty = Math.min(it.qty, it.avail);
      if (qty < it.qty) skipped.push(`${it.sku} (${qty}/${it.qty})`);
      const i = next.findIndex((l) => l.product_id === it.product_id && l.bin_id === it.bin_id);
      const line = { product_id: it.product_id, sku: it.sku, name: it.name, unit: it.unit, bin_id: it.bin_id, bin_code: it.bin_code, qty, avail: it.avail };
      if (i >= 0) next[i] = line; else next.push(line);
    }
    setLines(next);
    if (!notes) setNotes(`Kit: ${k.name}`);
    toast(skipped.length ? `Kit added · short: ${skipped.join(", ")}` : `${k.name} added`, skipped.length ? "info" : "success");
  };

  const submit = async () => {
    if (!driller) return toast("Select the driller name", "error");
    if (!rig) return toast("Select a rig number", "error");
    if (!lines.length) return toast("Add at least one item", "error");
    const over = lines.find((l) => type === "take" && l.qty > l.avail);
    if (over) return toast(`Only ${over.avail} ${over.unit} of ${over.sku} in ${over.bin_code}`, "error");
    setBusy(true);
    try {
      const r = await api("/requests", { method: "POST", body: {
        type, warehouse_id: wh, driller_name: driller, rig_number: rig, notes, client_ref: clientRef.current,
        items: lines.map((l) => ({ product_id: l.product_id, bin_id: l.bin_id, qty: l.qty })) } });
      qc.invalidateQueries();
      toast(`Request ${r.number} sent for approval`);
      router.replace({ pathname: "/request/[id]", params: { id: r.id } });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root} testID="new-request-screen">
      <Header title="Stock request" subtitle="Manager approval required" />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl }}>
        <Row>
          {(["take", "return"] as const).map((t) => (
            <Pressable key={t} testID={`request-type-${t}`} onPress={() => setType(t)}
              style={[s.typeBtn, { borderColor: type === t ? colors.brandPrimary : colors.border, backgroundColor: type === t ? colors.brandPrimary : colors.surfaceSecondary }]}>
              <Icon name={t === "take" ? "arrow-up-bold-box" : "arrow-down-bold-box"} size={28} color={type === t ? colors.onBrandPrimary : colors.onSurface} />
              <Body style={{ fontWeight: "800", color: type === t ? colors.onBrandPrimary : colors.onSurface }}>{t === "take" ? "TAKE STOCK" : "RETURN STOCK"}</Body>
            </Pressable>
          ))}
        </Row>

        {user?.role !== "manager" && (
          <View style={s.section}>
            <Label>Warehouse</Label>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow testIDPrefix="request-wh" value={wh} onChange={(v) => { setWh(v); setLines([]); }} options={[{ label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
            </View>
          </View>
        )}

        <View style={s.section}>
          <Label>Driller name</Label>
          <View style={{ marginHorizontal: -spacing.lg }}>
            <ChipRow testIDPrefix="request-driller" value={driller} onChange={setDriller} options={drillerOpts} />
          </View>
        </View>
        <View style={s.section}>
          <Label>Rig number</Label>
          <View style={{ marginHorizontal: -spacing.lg }}>
            <ChipRow testIDPrefix="request-rig" value={rig} onChange={setRig} options={(rigs.data || []).map((r) => ({ label: r.number, value: r.number }))} />
          </View>
        </View>

        {type === "take" && !!rig && (kits.data || []).length > 0 && (
          <View style={s.section} testID="request-kits">
            <Label>{rig} kits</Label>
            {(kits.data || []).map((k) => (
              <Card key={k.id} testID={`request-kit-${k.id}`} style={{ gap: spacing.sm, borderColor: colors.brandSecondary }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{k.name}</Body>
                    <Label>{k.items.length} items{k.short ? ` · ${k.short} short` : ""}</Label>
                  </View>
                  <Button testID={`request-kit-apply-${k.id}`} title="Add kit" icon="package-variant-plus" onPress={() => applyKit(k)} />
                </Row>
              </Card>
            ))}
          </View>
        )}

        <View style={s.section}>
          <Label>Items ({lines.length})</Label>
          {lines.map((l, i) => (
            <Card key={l.product_id + l.bin_id} testID={`request-line-${l.sku}`} style={{ gap: spacing.md }}>
              <Row style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Mono>{l.sku}</Mono>
                  <Body style={{ color: colors.onSurface }}>{l.name}</Body>
                  <Label>Bin {l.bin_code} · {l.avail} {l.unit} on hand</Label>
                </View>
                <IconButton testID={`request-line-remove-${l.sku}`} icon="trash-can-outline" onPress={() => setLines(lines.filter((_, j) => j !== i))} />
              </Row>
              <Stepper testID={`request-line-qty-${l.sku}`} value={l.qty} max={type === "take" ? Math.max(1, l.avail) : 9999}
                onChange={(n) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: n } : x)))} />
            </Card>
          ))}
          {!search && (
            <CommonItems wh={wh} rig={rig || undefined} onPick={(prod) => {
              const locs = (prod.locations || []).filter((l: any) => l.warehouse_id === wh);
              const loc = type === "take" ? [...locs].sort((a: any, b: any) => b.qty - a.qty)[0] : locs[0];
              if (!loc || (type === "take" && loc.qty <= 0)) return toast(`No ${prod.sku} on hand in ${wh}`, "error");
              addLine(prod, loc);
            }} />
          )}
          <Field testID="request-add-item-search" value={search} onChangeText={setSearch} placeholder="Add item: search SKU or name" autoCapitalize="characters" />
          <DidYouMean q={search} wh={wh} show={!results.isLoading && (results.data?.length ?? 0) < 2} onPick={(t) => setSearch(t)} testID="request-did-you-mean" />
          {(results.data || []).map((prod) => (
            <View key={prod.id} style={{ gap: spacing.xs }}>
              <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{prod.sku} · {prod.name}</Body>
              {prod.locations.length === 0 && <Label>No bin location in {wh}</Label>}
              {prod.locations.map((loc: any) => (
                <Pressable key={loc.bin_id} testID={`request-add-${prod.sku}-${loc.bin_code}`} style={s.result} onPress={() => addLine(prod, loc)}>
                  <Body>Bin {loc.bin_code} · {loc.qty} {prod.unit}</Body>
                  <Icon name="plus-circle" size={28} color={colors.brandPrimary} />
                </Pressable>
              ))}
            </View>
          ))}
          <Button testID="request-scan-bin" title="Scan a bin instead" icon="qrcode-scan" variant="ghost" onPress={() => router.push("/scan")} />
        </View>

        <Field testID="request-notes-input" label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Hole ID, job number, reason…" />
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="request-submit-button" large title={`Submit ${type} request`} icon="send" loading={busy} onPress={submit} />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
