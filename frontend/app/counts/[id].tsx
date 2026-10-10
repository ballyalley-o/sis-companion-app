import { useState } from "react";
import { FlatList, Platform, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useApi } from "@/src/hooks";
import { Body, Button, Card, ErrorState, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "@/src/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  input: { width: 96, height: 56, borderRadius: radius.md, borderWidth: 2, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary, color: c.onSurface, fontFamily: fonts.display, fontSize: 26, textAlign: "center" },
  footer: { borderTopWidth: 1, borderTopColor: c.divider, padding: spacing.lg, backgroundColor: c.surface },
}));

function LineRow({ ln, open, onSave }: { ln: any; open: boolean; onSave: (v: number) => Promise<void> }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [val, setVal] = useState(ln.counted === null ? "" : String(ln.counted));
  const variance = ln.counted !== null ? ln.counted - ln.expected : null;
  return (
    <Card testID={`count-line-${ln.sku}-${ln.bin_code}`} style={variance ? { borderColor: colors.warning, borderWidth: 2 } : undefined}>
      <Row>
        <View style={{ flex: 1, gap: 2 }}>
          <Mono>{ln.sku}</Mono>
          <Body numberOfLines={1}>{ln.name}</Body>
          <Label>Bin {ln.bin_code} · system {ln.expected}{variance ? ` · variance ${variance > 0 ? "+" : ""}${variance}` : ""}</Label>
        </View>
        {open ? (
          <TextInput testID={`count-input-${ln.sku}-${ln.bin_code}`} style={[s.input, ln.counted !== null && { borderColor: variance ? colors.warning : colors.success }]}
            keyboardType="number-pad" value={val} placeholder="—" placeholderTextColor={colors.muted}
            onChangeText={(t) => setVal(t.replace(/\D/g, ""))} onEndEditing={() => { if (val !== "" && Number(val) !== ln.counted) onSave(Number(val)); }} />
        ) : (
          <Body style={{ fontSize: 26, fontWeight: "800", color: colors.onSurface }}>{ln.counted}</Body>
        )}
      </Row>
    </Card>
  );
}

export default function CountDetail() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<any>(`/counts/${id}`);
  const [busy, setBusy] = useState(false);
  const c = q.data;

  const save = async (line_id: string, counted: number) => {
    try {
      await api(`/counts/${id}/lines`, { method: "POST", body: { line_id, counted } });
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const complete = async () => {
    setBusy(true);
    try {
      const r = await api(`/counts/${id}/complete`, { method: "POST" });
      toast(r.adjusted_lines ? `Posted ${r.adjusted_lines} adjustment(s) · ${r.zoho_txn_id}` : "Count complete · no variances");
      qc.invalidateQueries();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const done = c ? c.lines.filter((l: any) => l.counted !== null).length : 0;
  return (
    <View style={s.root} testID="count-detail-screen">
      <Header title={c?.number || "Count"} subtitle={c ? `${c.name} · ${c.warehouse_id}` : undefined} right={c && <StatusPill status={c.status} testID="count-detail-status" />} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : c && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <FlatList data={c.lines} keyExtractor={(l: any) => l.id} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            ListHeaderComponent={<Label testID="count-progress">{done}/{c.lines.length} lines counted</Label>}
            renderItem={({ item }) => <LineRow ln={item} open={c.status === "open"} onSave={(v) => save(item.id, v)} />} />
          {c.status === "open" && (
            <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Button testID="count-complete-button" large title="Complete & post" icon="check-all" loading={busy} disabled={done < c.lines.length} onPress={complete} />
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
