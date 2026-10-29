import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api, uid } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { Body, Button, Card, ChipRow, EmptyState, ErrorState, Field, H1, H2, H3, Icon, Label, Loading, Mono, Row, StatusPill, useToast } from "@/src/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type OrderLine = {
  line_id: string; zoho_item_id: string; product_id: string | null; sku: string; name: string; unit: string;
  ordered_qty: number; whole_units?: boolean; zoho_received_qty: number; local_received_qty: number; received_qty: number; remaining_qty: number;
};
type PurchaseOrder = {
  id: string; number: string; reference_number: string; supplier: string; status: string; expected_delivery_date: string;
  warehouse_id: string | null; mode: string; lines: OrderLine[]; remaining_units: number | null;
};
type Arrival = { qty: number; bin_id: string };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { width: "100%", maxWidth: 1520, alignSelf: "center", padding: spacing.xl, gap: spacing.lg },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.lg },
  panel: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  searchRow: { gap: spacing.md },
  result: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, padding: spacing.md, backgroundColor: c.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border },
  tableHeader: { flexDirection: "row", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.sm },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 78, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider, gap: spacing.sm },
  qtyButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary },
  count: { minWidth: 44, textAlign: "center", fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
}));

export default function Orders() {
  const s = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1050;
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const ordersQuery = useApi<PurchaseOrder[]>("/purchase-orders");
  const receiptsQuery = useApi<any[]>("/receipts");
  const receiptReference = useRef(uid());
  const [reference, setReference] = useState("");
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [arrivals, setArrivals] = useState<Record<string, Arrival>>({});
  const [scan, setScan] = useState("");
  const [warehouse, setWarehouse] = useState(user?.role === "manager" ? user.warehouse_id || "QLD" : "QLD");
  const [busy, setBusy] = useState(false);
  const binsQuery = useApi<any[]>(`/bins?warehouse_id=${warehouse}`);
  const bins = binsQuery.data || [];
  const binOptions = useMemo(() => bins.map((bin: any) => ({ label: bin.code, value: bin.id })), [bins]);
  const chosenWarehouse = order?.warehouse_id || warehouse;
  const scannedUnits = Object.values(arrivals).reduce((sum, value) => sum + value.qty, 0);
  const remainingUnits = order?.lines.reduce((sum, line) => sum + line.remaining_qty, 0) || 0;

  useEffect(() => {
    if (!order || !bins.length) return;
    setArrivals((current) => Object.fromEntries(order.lines.map((line) => [line.line_id, {
      qty: current[line.line_id]?.qty || 0,
      bin_id: current[line.line_id]?.bin_id || bins[0].id,
    }])));
  }, [order, bins]);

  const loadOrder = async (value: string) => {
    const clean = value.trim();
    if (!clean) return toast("Scan or enter a PO number / reference", "error");
    setBusy(true);
    try {
      const result = await api<PurchaseOrder>(`/purchase-orders/lookup?reference=${encodeURIComponent(clean)}`);
      setOrder(result);
      setReference(result.number);
      setWarehouse(result.warehouse_id || (user?.role === "manager" ? user.warehouse_id || "QLD" : "QLD"));
      setArrivals({});
      setScan("");
    } catch (error: any) {
      setOrder(null);
      toast(error.message || "Purchase order not found", "error");
    } finally {
      setBusy(false);
    }
  };

  const recordScan = () => {
    const code = scan.trim().toUpperCase();
    if (!code || !order) return;
    const line = order.lines.find((item) => item.product_id && item.whole_units !== false && [item.sku, item.zoho_item_id].some((candidate) => candidate.toUpperCase() === code));
    if (!line) {
      toast(`No matching item on ${order.number}: ${code}`, "error");
      setScan("");
      return;
    }
    const existing = arrivals[line.line_id]?.qty || 0;
    if (existing >= line.remaining_qty) {
      toast(`${line.sku} is already at the outstanding quantity`, "info");
      setScan("");
      return;
    }
    setArrivals((current) => ({ ...current, [line.line_id]: { qty: existing + 1, bin_id: current[line.line_id]?.bin_id || bins[0]?.id || "" } }));
    setScan("");
    toast(`${line.sku} scanned · ${existing + 1} of ${line.remaining_qty}`, "success");
  };

  const changeCount = (line: OrderLine, delta: number) => {
    setArrivals((current) => {
      const value = current[line.line_id] || { qty: 0, bin_id: bins[0]?.id || "" };
      return { ...current, [line.line_id]: { ...value, qty: Math.max(0, Math.min(line.remaining_qty, value.qty + delta)) } };
    });
  };

  const finishReceipt = async () => {
    if (!order || !scannedUnits) return toast("Scan at least one item before receiving", "error");
    const lines = order.lines.filter((line) => (arrivals[line.line_id]?.qty || 0) > 0);
    if (lines.some((line) => !arrivals[line.line_id]?.bin_id)) return toast("Choose a put-away bin for every received item", "error");
    setBusy(true);
    try {
      const receipt = await api(`/purchase-orders/${encodeURIComponent(order.id)}/receive`, { method: "POST", body: {
        warehouse_id: chosenWarehouse,
        client_ref: receiptReference.current,
        notes: "Received using PO scanner workspace",
        items: lines.map((line) => ({ line_id: line.line_id, product_id: line.product_id, bin_id: arrivals[line.line_id].bin_id, qty: arrivals[line.line_id].qty })),
      } });
      toast(`${receipt.number} posted to local stock · Zoho order unchanged`, "success");
      receiptReference.current = uid();
      queryClient.invalidateQueries();
      setScan("");
      await loadOrder(order.number);
    } catch (error: any) {
      toast(error.message || "Unable to post receipt", "error");
    } finally {
      setBusy(false);
    }
  };

  const resumeReceipt = async (receipt: any) => {
    setBusy(true);
    try {
      await api(`/purchase-orders/${encodeURIComponent(receipt.purchase_order_id)}/receive`, { method: "POST", body: {
        warehouse_id: receipt.warehouse_id, client_ref: receipt.client_ref, notes: receipt.notes,
        items: receipt.items.map((item: any) => ({ line_id: item.purchase_order_line_id, product_id: item.product_id, bin_id: item.bin_id, qty: item.qty })),
      } });
      queryClient.invalidateQueries();
      toast(`${receipt.number} finished posting`, "success");
      if (order && order.id === receipt.purchase_order_id) await loadOrder(order.number);
    } catch (error: any) {
      toast(error.message || "Unable to resume receipt", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root} testID="orders-screen">
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.heading, !desktop && { flexDirection: "column" }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>PROCUREMENT · GOODS IN</Label>
            <H1>Purchase orders</H1>
            <Body style={{ color: colors.muted }}>Find a Zoho order, scan each arriving item, and post counted units into a bin.</Body>
          </View>
          <StatusPill status={order?.mode === "mock" ? "mock" : "live"}
            label={order?.mode === "mock" ? "Zoho mock · read only" : "Zoho read only"} />
        </View>

        <View style={{ flexDirection: desktop ? "row" : "column", alignItems: "stretch", gap: spacing.lg }}>
          <View style={[s.panel, { width: desktop ? 300 : "100%" }]}>
            <H3>Find an order</H3>
            <Body style={{ color: colors.muted }}>Scan or type the purchase order number or supplier reference.</Body>
            <View style={s.searchRow}>
              <View style={{ flex: 1 }}>
                <Field testID="po-reference-input" label="PO / reference no." value={reference} onChangeText={setReference}
                  placeholder="Scan or enter PO number" autoCapitalize="characters" returnKeyType="search" onSubmitEditing={() => loadOrder(reference)} />
              </View>
              <Button testID="po-find-button" title="Find" icon="magnify" loading={busy} onPress={() => loadOrder(reference)} />
            </View>
            {ordersQuery.isLoading ? <Loading text="Loading Zoho orders…" /> : ordersQuery.isError ? <ErrorState message={(ordersQuery.error as Error).message} onRetry={ordersQuery.refetch} /> : (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <Row style={{ justifyContent: "space-between" }}><H3>Open orders</H3><Label>{ordersQuery.data?.length || 0} active</Label></Row>
                {!ordersQuery.data?.length ? <EmptyState icon="clipboard-text-outline" title="No open orders" text="Connect Zoho or scan a purchase order reference." /> : ordersQuery.data.map((item) => (
                  <Pressable key={item.id} testID={`po-open-${item.number}`} onPress={() => loadOrder(item.number)} style={s.result}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Mono>{item.number}</Mono>
                      <Body numberOfLines={1}>{item.supplier || "Supplier not listed"}</Body>
                      <Label>{item.expected_delivery_date ? `Expected ${item.expected_delivery_date}` : item.status}</Label>
                    </View>
                    <Icon name="chevron-right" size={24} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}
            <H3>Recent arrivals</H3>
            {(receiptsQuery.data || []).filter((receipt) => receipt.purchase_order_id).slice(0, 6).map((receipt) => (
              <View key={receipt.id} style={s.result}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Mono>{receipt.number}</Mono>
                  <Body>{receipt.purchase_order_number} · {receipt.items.reduce((sum: number, item: any) => sum + item.qty, 0)} units</Body>
                  <Label>{receipt.warehouse_id} · {receipt.received_by}</Label>
                  {receipt.status === "posting" && <Button title="Resume receipt" loading={busy} onPress={() => resumeReceipt(receipt)} />}
                </View>
                <Icon name={receipt.status === "posting" ? "clock-outline" : "check-circle"} size={22} color={receipt.status === "posting" ? colors.warning : colors.success} />
              </View>
            ))}
            {!(receiptsQuery.data || []).some((receipt) => receipt.purchase_order_id) && <Body style={{ color: colors.muted }}>Posted PO receipts will appear here.</Body>}
          </View>

          <View style={[s.panel, { flex: 1, minWidth: 0 }]}>
            {!order ? <EmptyState icon="barcode-scan" title="Ready for a purchase order" text="Scan the PO reference to load its ordered lines and begin counting arrivals." /> : <>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
                <View style={{ gap: 4, flex: 1 }}>
                  <Label>{order.supplier || "SUPPLIER"} · {chosenWarehouse} WAREHOUSE</Label>
                  <H2>{order.number}</H2>
                  <Body style={{ color: colors.muted }}>{order.reference_number ? `Supplier ref ${order.reference_number} · ` : ""}{order.status.replaceAll("_", " ")}</Body>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Body style={{ color: colors.success, fontFamily: fonts.display, fontSize: 28 }}>{scannedUnits}<Body style={{ color: colors.muted, fontSize: 15 }}> / {remainingUnits} remaining</Body></Body>
                  <Label>COUNTED THIS SESSION</Label>
                </View>
              </Row>

              {user?.role === "admin" && !order.warehouse_id && (
                <ChipRow testIDPrefix="po-warehouse" value={warehouse} onChange={setWarehouse} options={[{ label: "Queensland", value: "QLD" }, { label: "New South Wales", value: "NSW" }]} />
              )}

              <Card style={{ gap: spacing.sm, borderColor: colors.brandPrimary }}>
                <Row style={{ flexWrap: "wrap" }}><Icon name="barcode-scan" size={24} color={colors.brandPrimary} /><H3>Rapid item scan</H3><Label>USB / Bluetooth HID scanner</Label></Row>
                <Field testID="po-item-scanner" label="Scan item barcode or SKU; each scan adds one" value={scan} onChangeText={setScan}
                  placeholder="Focus here, scan item, repeat" autoCapitalize="characters" returnKeyType="done" blurOnSubmit={false} onSubmitEditing={recordScan} />
              </Card>

              <View style={[s.tableHeader, !desktop && { display: "none" }]}>
                <Label style={{ flex: 3 }}>ORDERED ITEM</Label><Label style={{ width: 68, textAlign: "center" }}>ORDERED</Label>
                <Label style={{ width: 68, textAlign: "center" }}>RECEIVED</Label><Label style={{ width: 126, textAlign: "center" }}>COUNT NOW</Label>
              </View>
              {order.lines.map((line) => {
                const arrival = arrivals[line.line_id] || { qty: 0, bin_id: bins[0]?.id || "" };
                const canReceive = !!line.product_id && line.whole_units !== false && line.remaining_qty > 0;
                return (
                  <View key={line.line_id} testID={`po-line-${line.sku || line.line_id}`} style={[s.tableRow, { flexWrap: desktop ? "nowrap" : "wrap" }]}>
                    <View style={{ flex: 3, minWidth: 190, gap: 2 }}>
                      <Mono>{line.sku || "NO SKU"}</Mono><Body style={{ color: colors.onSurface, fontWeight: "700" }}>{line.name}</Body>
                      {!line.product_id && <Label style={{ color: colors.warning }}>Link this Zoho item to a local SKU before receiving</Label>}
                      {line.whole_units === false && <Label style={{ color: colors.warning }}>Fractional quantities require receiving review</Label>}
                      {line.product_id && !line.remaining_qty && <Label style={{ color: colors.success }}>Fully received</Label>}
                    </View>
                    <Body style={{ width: 68, textAlign: "center", fontWeight: "800" }}>{!desktop ? "Ordered " : ""}{line.ordered_qty} {line.unit}</Body>
                    <View style={{ width: 68, alignItems: "center", gap: 3 }}><Body style={{ fontWeight: "800" }}>{line.received_qty}</Body><Label>{line.remaining_qty} left</Label></View>
                    <View style={{ width: 126, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <Pressable testID={`po-count-minus-${line.sku}`} disabled={!canReceive} onPress={() => changeCount(line, -1)} style={[s.qtyButton, !canReceive && { opacity: 0.4 }]}><Icon name="minus" size={20} color={colors.onSurface} /></Pressable>
                      <TextInput testID={`po-count-${line.sku}`} style={[s.count, { width: 46 }]} value={String(arrival.qty)} keyboardType="number-pad" editable={canReceive && !busy}
                        onChangeText={(value) => {
                          const qty = Math.min(line.remaining_qty, Math.max(0, parseInt(value.replace(/\D/g, ""), 10) || 0));
                          setArrivals((current) => ({ ...current, [line.line_id]: { ...arrival, qty } }));
                        }} />
                      <Pressable testID={`po-count-plus-${line.sku}`} disabled={!canReceive || arrival.qty >= line.remaining_qty} onPress={() => changeCount(line, 1)} style={[s.qtyButton, (!canReceive || arrival.qty >= line.remaining_qty) && { opacity: 0.4 }]}><Icon name="plus" size={20} color={colors.onSurface} /></Pressable>
                    </View>
                    {!!line.product_id && !!line.remaining_qty && (
                      <View style={{ width: desktop ? 150 : "100%", marginLeft: desktop ? spacing.xs : 0 }}>
                        <Label>Put-away bin</Label>
                        <ChipRow testIDPrefix={`po-bin-${line.sku}`} value={arrival.bin_id} options={binOptions} onChange={(bin_id) => setArrivals((current) => ({ ...current, [line.line_id]: { ...arrival, bin_id } }))} />
                      </View>
                    )}
                  </View>
                );
              })}
              <Row style={{ justifyContent: "space-between", flexDirection: desktop ? "row" : "column", alignItems: desktop ? "center" : "stretch" }}>
                <Body style={{ color: colors.muted, flex: desktop ? 1 : undefined }}>Review counts and per-item put-away bins before posting the receipt.</Body>
                <Button testID="po-post-receipt" title={`Post ${scannedUnits} to stock`} icon="truck-check" variant="success" loading={busy} disabled={!scannedUnits} onPress={finishReceipt} />
              </Row>
              <Label style={{ color: colors.warning }}>Local receipt only: this updates SIS stock and history; it does not modify Zoho inventory or the Zoho purchase order.</Label>
            </>}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
