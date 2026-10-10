import { Pressable, ScrollView, View } from "react-native";
import { useRouter, Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { Body, Button, H1, H3, Icon, IconName, Label } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Item = { icon: IconName; label: string; sub: string; href: Href; roles: string[]; id: string };
const ITEMS: Item[] = [
  { id: "requests", icon: "gavel", label: "Stock requests", sub: "Approve / reject or track yours", href: "/requests", roles: ["driller", "manager", "admin"] },
  { id: "new-request", icon: "clipboard-plus-outline", label: "New stock request", sub: "Take or return stock", href: "/request/new", roles: ["driller", "manager", "admin"] },
  { id: "notifications", icon: "bell-outline", label: "Notifications", sub: "Approvals, low stock, damage", href: "/notifications", roles: ["driller", "manager", "admin"] },
  { id: "counts", icon: "clipboard-check-outline", label: "Stocktake & cycle counts", sub: "Count bins, post variances", href: "/counts", roles: ["manager", "admin"] },
  { id: "bins", icon: "qrcode", label: "Bins & QR labels", sub: "Manage bins, print labels", href: "/bins", roles: ["manager", "admin"] },
  { id: "reports", icon: "chart-box-outline", label: "Reports", sub: "Low stock, discrepancies, movements, audit", href: "/reports", roles: ["driller", "manager", "admin"] },
  { id: "zoho", icon: "cloud-sync-outline", label: "Zoho integration", sub: "OAuth connection & settings", href: "/zoho", roles: ["admin"] },
  { id: "users", icon: "account-group-outline", label: "Users & roles", sub: "Drillers, managers, admins", href: "/users", roles: ["admin"] },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.lg, minHeight: 72, paddingHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  iconBox: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  profile: { padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: c.brandPrimary, gap: 4 },
}));

export default function More() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  return (
    <View style={s.root} testID="more-screen">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: bottomChrome + spacing.xl }}>
        <H1>More</H1>
        <View style={s.profile}>
          <H3 testID="more-user-name">{user?.name}</H3>
          <Body>{user?.email}</Body>
          <Label>{user?.role}{user?.warehouse_id ? ` · ${user.warehouse_id}` : ""}</Label>
        </View>
        {ITEMS.filter((i) => i.roles.includes(user?.role || "")).map((i) => (
          <Pressable key={i.id} testID={`more-${i.id}`} onPress={() => router.push(i.href)} style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}>
            <View style={s.iconBox}><Icon name={i.icon} size={26} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Body style={{ color: colors.onSurface, fontWeight: "800", fontSize: 16 }}>{i.label}</Body>
              <Body style={{ color: colors.muted, fontSize: 13 }}>{i.sub}</Body>
            </View>
            <Icon name="chevron-right" size={28} color={colors.muted} />
          </Pressable>
        ))}
        <Button testID="logout-button" title="Sign out" icon="logout" variant="secondary" onPress={async () => { await logout(); router.replace("/login"); }} style={{ marginTop: spacing.md }} />
      </ScrollView>
    </View>
  );
}
