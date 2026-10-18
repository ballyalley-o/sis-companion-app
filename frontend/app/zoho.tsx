import { useEffect, useState } from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, Chip, ChipRow, Field, H3, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Zoho() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useApi<any>("/zoho/settings");
  const log = useApi<any[]>("/zoho/sync-log");
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [locs, setLocs] = useState<any[] | null>(null);
  const [importRes, setImportRes] = useState<any>(null);
  useEffect(() => {
    if (q.data && !f) {
      setF({ ...q.data, client_secret: "", mode: q.data.selected_mode,
        redirect_uri: q.data.redirect_uri || `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/zoho/callback` });
    }
  }, [q.data, f]);
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const consoleUrl = `https://api-console.zoho.${f?.data_center || "com.au"}`;

  const loadLocations = async () => {
    setBusy("locs");
    try {
      const r = await api("/zoho/locations");
      setLocs(r.locations);
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  };
  const runImport = async () => {
    setBusy("import");
    try {
      const r = await api("/zoho/import", { method: "POST", body: { sync_stock: true } });
      setImportRes(r);
      toast(`Imported: ${r.created} new, ${r.updated} updated, ${r.stock_adjusted} stock lines aligned`);
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy("save");
    try {
      const r = await api("/zoho/settings", { method: "PUT", body: {
        client_id: f.client_id, client_secret: f.client_secret, organization_id: f.organization_id, data_center: f.data_center,
        redirect_uri: f.redirect_uri, qld_warehouse_id: f.qld_warehouse_id, nsw_warehouse_id: f.nsw_warehouse_id,
        adjustment_account_id: f.adjustment_account_id || "", mode: f.mode, auto_sync: true } });
      setF({ ...r, client_secret: "", mode: r.selected_mode });
      toast("Zoho settings saved");
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  };
  const connect = async () => {
    setBusy("connect");
    try {
      const r = await api("/zoho/connect", { method: "POST" });
      if (r.auth_url) {
        await WebBrowser.openBrowserAsync(r.auth_url);
        await q.refetch();
      } else toast("Connected in mock mode — transactions are simulated");
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  };
  const disconnect = async () => {
    await api("/zoho/disconnect", { method: "POST" }).catch(() => {});
    toast("Disconnected", "info");
    qc.invalidateQueries();
  };

  return (
    <View style={s.root} testID="zoho-screen">
      <Header title="Zoho Inventory" subtitle="OAuth connection & integration" />
      {!f ? <Loading /> : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ gap: spacing.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <H3>Connection</H3>
              <StatusPill testID="zoho-connection-status" status={q.data?.connected ? "approved" : "pending"} label={q.data?.connected ? "Connected" : "Not connected"} />
            </Row>
            <Row><Label>Mode</Label><StatusPill status={q.data?.mode || "mock"} /></Row>
            {q.data?.connected_at && <Label>Since {fmtDate(q.data.connected_at)}</Label>}
            <Body style={{ fontSize: 13 }}>
              {q.data?.mode === "live" ? "Live: approvals, receipts and counts post inventory adjustments to Zoho before local stock updates."
                : "Mock mode: every approval and count posts a simulated Zoho adjustment (MOCK-ADJ-…). Follow the setup steps below to go live."}
            </Body>
            <Row>
              <Button testID="zoho-connect-button" title={q.data?.connected ? "Reconnect" : "Connect Zoho"} icon="link-variant" style={{ flex: 1 }} loading={busy === "connect"} onPress={connect} />
              {q.data?.connected && <Button testID="zoho-disconnect-button" title="Disconnect" variant="secondary" style={{ flex: 1 }} onPress={disconnect} />}
            </Row>
          </Card>

          <Card testID="zoho-setup-help" style={{ gap: spacing.sm, borderColor: colors.brandSecondary }}>
            <H3>Setup steps</H3>
            <Body style={{ fontSize: 14 }}>1. Open the Zoho API Console → Add Client → “Server-based Applications”.</Body>
            <Body style={{ fontSize: 14 }}>2. Homepage URL: your app address. Authorized Redirect URI: copy the Redirect URI field below exactly.</Body>
            <Body style={{ fontSize: 14 }}>3. Create, then copy the Client ID and Client Secret into the fields below.</Body>
            <Body style={{ fontSize: 14 }}>4. Organization ID: Zoho Inventory → Settings → Organization Profile (or the number shown under your org name).</Body>
            <Body style={{ fontSize: 14 }}>5. Choose Live mode, Save, then tap Connect Zoho and approve access.</Body>
            <Body style={{ fontSize: 14 }}>6. Load Zoho locations, tap QLD / NSW to map, Save, then Import items & stock.</Body>
            <Button testID="zoho-open-console" title="Open Zoho API Console" icon="open-in-new" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(consoleUrl)} />
          </Card>

          <View style={{ gap: spacing.sm }}>
            <Label>Mode</Label>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow testIDPrefix="zoho-mode" value={f.mode} onChange={set("mode")} options={[{ label: "Mock (simulated)", value: "mock" }, { label: "Live Zoho", value: "live" }]} />
            </View>
          </View>

          <H3>OAuth credentials</H3>
          <Field testID="zoho-client-id-input" label="Client ID" value={f.client_id} onChangeText={set("client_id")} autoCapitalize="none" placeholder="1000.XXXX" />
          <Field testID="zoho-client-secret-input" label={`Client secret ${f.client_secret_masked ? `(saved ${f.client_secret_masked})` : ""}`} value={f.client_secret} onChangeText={set("client_secret")} secureTextEntry autoCapitalize="none" placeholder="Leave blank to keep current" />
          <Field testID="zoho-org-id-input" label="Organization ID" value={f.organization_id} onChangeText={set("organization_id")} keyboardType="number-pad" />
          <Field testID="zoho-redirect-input" label="Redirect URI" value={f.redirect_uri} onChangeText={set("redirect_uri")} autoCapitalize="none" placeholder={`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/zoho/callback`} />
          <View style={{ gap: spacing.sm }}>
            <Label>Data center</Label>
            <View style={{ marginHorizontal: -spacing.lg }}>
              <ChipRow testIDPrefix="zoho-dc" value={f.data_center} onChange={set("data_center")}
                options={[{ label: "Australia (.com.au)", value: "com.au" }, { label: "US (.com)", value: "com" }, { label: "EU", value: "eu" }, { label: "India", value: "in" }]} />
            </View>
          </View>
          <H3>Warehouse mapping</H3>
          {q.data?.selected_mode === "live" && (
            <Button testID="zoho-load-locations" title="Load Zoho locations" icon="warehouse" variant="secondary" loading={busy === "locs"} onPress={loadLocations} />
          )}
          {(locs || []).map((l) => (
            <Card key={l.id} testID={`zoho-location-${l.id}`} style={{ gap: spacing.sm }}>
              <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{l.name}</Body>
              <Label>{l.state || "—"} · ID {l.id}</Label>
              <Row>
                <Chip testID={`zoho-map-qld-${l.id}`} label="Use for QLD" selected={f.qld_warehouse_id === l.id} onPress={() => setF({ ...f, qld_warehouse_id: l.id })} />
                <Chip testID={`zoho-map-nsw-${l.id}`} label="Use for NSW" selected={f.nsw_warehouse_id === l.id} onPress={() => setF({ ...f, nsw_warehouse_id: l.id })} />
              </Row>
            </Card>
          ))}
          <Field testID="zoho-qld-wh-input" label="QLD → Zoho location ID" value={f.qld_warehouse_id} onChangeText={set("qld_warehouse_id")} />
          <Field testID="zoho-nsw-wh-input" label="NSW → Zoho location ID" value={f.nsw_warehouse_id} onChangeText={set("nsw_warehouse_id")} />
          <Field testID="zoho-adj-account-input" label="Adjustment account ID (optional)" value={f.adjustment_account_id} onChangeText={set("adjustment_account_id")} placeholder="Leave blank for Zoho default" />
          <Button testID="zoho-save-button" title="Save settings" icon="content-save" large loading={busy === "save"} onPress={save} />

          {q.data?.selected_mode === "live" && (
            <Card style={{ gap: spacing.sm }} testID="zoho-import-card">
              <H3>Import items & stock</H3>
              <Body style={{ fontSize: 13 }}>Matches Zoho items to app products by SKU (creates missing ones) and aligns QLD/NSW quantities to Zoho. New stock lands in the “UNASSIGNED” bin for put-away.</Body>
              {(importRes || q.data?.last_import) && (
                <Label testID="zoho-import-result">
                  Last import: {(importRes || q.data.last_import).created} new · {(importRes || q.data.last_import).updated} updated · {(importRes || q.data.last_import).stock_adjusted} stock aligned · {(importRes || q.data.last_import).skipped_no_sku} without SKU
                </Label>
              )}
              <Button testID="zoho-import-button" title="Import from Zoho" icon="cloud-download" loading={busy === "import"} onPress={runImport} />
            </Card>
          )}

          <H3>Sync log</H3>
          {(log.data || []).length === 0 && <Body>No transactions yet.</Body>}
          {(log.data || []).slice(0, 20).map((l) => (
            <Card key={l.id} style={{ gap: 2 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono style={{ fontSize: 15 }}>{l.txn_id || "FAILED"}</Mono>
                <StatusPill status={l.status === "success" ? "approved" : "rejected"} label={l.status} />
              </Row>
              <Body style={{ fontSize: 13 }}>{l.reason}</Body>
              <Label>{l.warehouse_id} · {l.lines.length} line(s) · {fmtDate(l.at)}</Label>
              {l.error && <Body style={{ color: colors.error, fontSize: 12 }}>{l.error}</Body>}
            </Card>
          ))}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}
