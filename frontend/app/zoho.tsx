import { useEffect, useState } from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { fmtDate, useApi } from "@/src/hooks";
import { Body, Button, Card, ChipRow, Field, H3, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "@/src/ui";
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
  useEffect(() => { if (q.data && !f) setF({ ...q.data, client_secret: "" }); }, [q.data, f]);
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });

  const save = async () => {
    setBusy("save");
    try {
      const r = await api("/zoho/settings", { method: "PUT", body: {
        client_id: f.client_id, client_secret: f.client_secret, organization_id: f.organization_id, data_center: f.data_center,
        redirect_uri: f.redirect_uri, qld_warehouse_id: f.qld_warehouse_id, nsw_warehouse_id: f.nsw_warehouse_id, auto_sync: true } });
      setF({ ...r, client_secret: "" });
      toast("Zoho settings saved");
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  };
  const connect = async () => {
    setBusy("connect");
    try {
      const r = await api("/zoho/connect", { method: "POST" });
      if (r.auth_url) await WebBrowser.openBrowserAsync(r.auth_url);
      else toast("Connected in mock mode — transactions are simulated");
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
              {q.data?.mode === "live" ? "Approvals post inventory adjustments to Zoho before local stock updates."
                : "Mock mode: every approval and count posts a simulated Zoho adjustment (MOCK-ADJ-…). Add real credentials and set ZOHO_MODE=live on the server to go live."}
            </Body>
            <Row>
              <Button testID="zoho-connect-button" title={q.data?.connected ? "Reconnect" : "Connect Zoho"} icon="link-variant" style={{ flex: 1 }} loading={busy === "connect"} onPress={connect} />
              {q.data?.connected && <Button testID="zoho-disconnect-button" title="Disconnect" variant="secondary" style={{ flex: 1 }} onPress={disconnect} />}
            </Row>
          </Card>

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
          <Field testID="zoho-qld-wh-input" label="QLD → Zoho warehouse ID" value={f.qld_warehouse_id} onChangeText={set("qld_warehouse_id")} />
          <Field testID="zoho-nsw-wh-input" label="NSW → Zoho warehouse ID" value={f.nsw_warehouse_id} onChangeText={set("nsw_warehouse_id")} />
          <Button testID="zoho-save-button" title="Save settings" icon="content-save" large loading={busy === "save"} onPress={save} />

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
