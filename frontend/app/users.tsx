import { useState } from "react";
import { FlatList, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useApi } from "@/src/hooks";
import { Body, Button, Card, Chip, ErrorState, Field, H3, Header, IconButton, Label, Loading, Row, Sheet, StatusPill, useToast } from "@/src/ui";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));

export default function Users() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useApi<any[]>("/users");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "driller", warehouse_id: "QLD" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await api("/users", { method: "POST", body: { ...f, warehouse_id: f.role === "admin" ? null : f.warehouse_id } });
      toast(`${f.name} added`);
      setOpen(false);
      setF({ name: "", email: "", password: "", role: "driller", warehouse_id: "QLD" });
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  const toggle = async (u: any) => {
    try {
      await api(`/users/${u.id}/toggle`, { method: "PATCH" });
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, "error"); }
  };

  return (
    <View style={s.root} testID="users-screen">
      <Header title="Users" subtitle="Roles & warehouse access" right={<IconButton testID="users-new-button" icon="account-plus" onPress={() => setOpen(true)} />} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <FlatList data={q.data} keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item: u }) => (
            <Card testID={`user-card-${u.email}`} style={!u.active ? { opacity: 0.5 } : undefined}>
              <Row>
                <View style={{ flex: 1, gap: 2 }}>
                  <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{u.name}</Body>
                  <Body style={{ fontSize: 13 }}>{u.email}</Body>
                  <Row style={{ gap: spacing.sm }}>
                    <StatusPill status={u.role === "admin" ? "live" : u.role === "manager" ? "open" : "take"} label={u.role} />
                    {u.warehouse_id && <Label>{u.warehouse_id}</Label>}
                  </Row>
                </View>
                <IconButton testID={`user-toggle-${u.email}`} icon={u.active ? "account-cancel" : "account-check"} onPress={() => toggle(u)} />
              </Row>
            </Card>
          )} />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} testID="new-user-sheet">
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
          <H3>Add user</H3>
          <Field testID="user-name-input" placeholder="Full name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Field testID="user-email-input" placeholder="Email" value={f.email} autoCapitalize="none" keyboardType="email-address" onChangeText={(v) => setF({ ...f, email: v })} />
          <Field testID="user-password-input" placeholder="Temporary password (8+ chars)" value={f.password} secureTextEntry onChangeText={(v) => setF({ ...f, password: v })} />
          <Label>Role</Label>
          <Row style={{ gap: spacing.sm }}>
            {["driller", "manager", "admin"].map((r) => <Chip key={r} testID={`user-role-${r}`} label={r} selected={f.role === r} onPress={() => setF({ ...f, role: r })} />)}
          </Row>
          {f.role !== "admin" && (
            <>
              <Label>Home warehouse</Label>
              <Row style={{ gap: spacing.sm }}>
                {["QLD", "NSW"].map((w) => <Chip key={w} testID={`user-wh-${w}`} label={w} selected={f.warehouse_id === w} onPress={() => setF({ ...f, warehouse_id: w })} />)}
              </Row>
            </>
          )}
          <Button testID="user-create-button" title="Create user" icon="account-plus" loading={busy} onPress={create} />
        </KeyboardAwareScrollView>
      </Sheet>
    </View>
  );
}
