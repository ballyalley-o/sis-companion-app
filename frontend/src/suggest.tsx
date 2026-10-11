import { Pressable, ScrollView, View } from "react-native";
import { useApi } from "@/src/hooks";
import { Body, Chip, Icon, Label, Row } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  box: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandSecondary },
  item: { width: 150, minHeight: 84, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 2, flexShrink: 0 },
}));

/** "Did you mean…" helper for misspelt searches. Shows when there are few/no exact results. */
export function DidYouMean({ q, wh, show, onPick, testID = "did-you-mean" }: {
  q: string; wh?: string; show: boolean; onPick: (text: string, product?: any) => void; testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const enabled = show && q.trim().length >= 3;
  const res = useApi<{ corrected: string | null; items: any[] }>(enabled ? `/products/suggest?q=${encodeURIComponent(q.trim())}${wh ? `&warehouse_id=${wh}` : ""}` : null);
  const d = res.data;
  if (!enabled || !d || (!d.corrected && d.items.length === 0)) return null;
  return (
    <View style={s.box} testID={testID}>
      <Row style={{ gap: spacing.sm }}>
        <Icon name="spellcheck" size={20} color={colors.brandPrimary} />
        <Label style={{ color: colors.onBrandTertiary }}>Did you mean</Label>
      </Row>
      <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
        {d.corrected && <Chip testID={`${testID}-corrected`} label={`“${d.corrected}”`} selected onPress={() => onPick(d.corrected!)} />}
        {d.items.slice(0, 4).map((p) => (
          <Chip key={p.id} testID={`${testID}-${p.sku}`} label={`${p.sku} · ${p.name}`} onPress={() => onPick(p.sku, p)} />
        ))}
      </Row>
    </View>
  );
}

/** Horizontal strip of frequently used items (per warehouse / rig). */
export function CommonItems({ wh, rig, kind = "request", onPick, title = "Common items" }: {
  wh: string; rig?: string; kind?: "request" | "receive"; onPick: (p: any) => void; title?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const res = useApi<any[]>(`/products/common?warehouse_id=${wh}&kind=${kind}${rig ? `&rig=${encodeURIComponent(rig)}` : ""}`);
  if (!res.data?.length) return null;
  return (
    <View style={{ gap: spacing.sm }} testID="common-items">
      <Row style={{ gap: spacing.sm }}>
        <Icon name="star-circle" size={20} color={colors.brandPrimary} />
        <Label>{title}{rig ? ` · ${rig}` : ""}</Label>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {res.data.map((p) => {
          const total = p.totals?.[wh] || 0;
          return (
            <Pressable key={p.id} testID={`common-item-${p.sku}`} style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]} onPress={() => onPick(p)}>
              <Body style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{p.sku}</Body>
              <Body style={{ color: colors.onSurface, fontSize: 13 }} numberOfLines={2}>{p.name}</Body>
              <Label>{total} {p.unit}{p.uses ? ` · used ${p.uses}×` : ""}</Label>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
