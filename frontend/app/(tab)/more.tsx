import { GLOBAL } from "config/global.config"
import { VersionInfo } from "component/version-info"
import { PATH } from 'route/path'
import { Linking, Pressable, ScrollView, View } from "react-native"
import { useRouter, Href } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { roleLabel, useAuth } from "state/auth"
import { usesNativeTab } from "config/navigation"
import { Body, Button, H1, H3, Icon, IconName, Label, useToast } from "component/ui"
import { makeStyles, radius, spacing, useTheme } from "design/theme"

type Item = { icon: IconName; label: string; sub: string; href: Href; roles: string[]; id: string }
const ITEMS: Item[] = [
  { id: "account", icon: "account-circle-outline", label: "My account", sub: "Profile, password & assigned rig", href: PATH.ACCOUNT, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "rig-account", icon: "truck-outline", label: "Rig accounts", sub: "Crew, pallets, trips & equipment", href: PATH.RIG_ACCOUNT, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "warehouse-map", icon: "map-marker", label: "Warehouse map", sub: "Floor plan and product bin locations", href: PATH.WAREHOUSE_MAP, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "trips", icon: "calendar-month", label: "Trip calendar", sub: "Plan trips & pre-order stock", href: PATH.TRIP, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "history", icon: "timeline-text-outline", label: "Stock history", sub: "Trace every movement of an item", href: PATH.HISTORY, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "reorders", icon: "cart-arrow-down", label: "Reorders", sub: "Purchase reorders for trips & low stock", href: PATH.REORDER, roles: ["manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "requests", icon: "gavel", label: "Stock requests", sub: "Approve / reject or track yours", href: PATH.REQUEST, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "new-request", icon: "clipboard-plus-outline", label: "New stock request", sub: "Take or return stock", href: PATH.REQUEST_NEW, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "receive", icon: "truck-check", label: "Receive stock", sub: "Goods in from suppliers into bins", href: PATH.RECEIVE, roles: ["manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "orders", icon: "clipboard-list-outline", label: "Zoho purchase orders", sub: "Scan order references and receive arrivals", href: PATH.ORDER, roles: ["manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "kits", icon: "package-variant-plus", label: "Rig kits", sub: "Standard item kits per rig", href: PATH.KIT, roles: ["manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "notifications", icon: "bell-outline", label: "Notifications", sub: "Approvals, low stock, damage", href: PATH.NOTIFICATION, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "counts", icon: "clipboard-check-outline", label: "Stocktake & cycle counts", sub: "Count bins, post variances", href: PATH.COUNT, roles: ["manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "bins", icon: "qrcode", label: "Bins & QR labels", sub: "Manage bins, print labels", href: PATH.BIN, roles: ["manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "reports", icon: "chart-box-outline", label: "Reports", sub: "Low stock, discrepancies, movements, audit", href: PATH.REPORT, roles: ["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"] },
  { id: "zoho", icon: "cloud-sync-outline", label: "Zoho integration", sub: "OAuth connection & settings", href: PATH.ZOHO, roles: ["admin"] },
  { id: "users", icon: "account-group-outline", label: "Users & roles", sub: "Drillers, managers, admins", href: PATH.USER, roles: ["admin"] },
]

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.lg, minHeight: 72, paddingHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  iconBox: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  profile: { padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: c.brandPrimary, gap: 4 },
}))

export default function More() {
  const s = useStyles()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user, logout } = useAuth()
  const toast = useToast()
  const documentationUrl = GLOBAL.DOCUMENTATION_URL
  const helpEnabled = Boolean(documentationUrl && (/^https:\/\//i.test(documentationUrl) || /^http:\/\/(localhost|127\.0\.0\.1):8090\//i.test(documentationUrl)))
  const bottomChrome = usesNativeTab ? insets.bottom : 0
  return (
    <View style={s.root} testID="more-screen">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: bottomChrome + spacing.xl }}>
        <H1>More</H1>
        <View style={s.profile}>
          <H3 testID="more-user-name">{user?.name}</H3>
          <Body>{user?.email}</Body>
          <Label>{roleLabel(user?.role)}{user?.warehouse_id ? ` · ${user.warehouse_id}` : ""}</Label>
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
        {helpEnabled && <Pressable testID="more-help-centre" accessibilityRole="link" accessibilityLabel="Open staff help centre in browser" onPress={() => {
          if (documentationUrl) Linking.openURL(documentationUrl).catch(() => toast("Could not open the help centre", "error"))
        }} style={s.item}>
          <View style={s.iconBox}><Icon name="book-open-page-variant-outline" size={26} color={colors.brandPrimary} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Body style={{ color: colors.onSurface, fontWeight: "800", fontSize: 16 }}>Help centre</Body>
            <Body style={{ color: colors.muted, fontSize: 13 }}>How-to guides & workflows · staff sign-in may be required</Body>
          </View>
          <Icon name="open-in-new" size={24} color={colors.muted} />
        </Pressable>}
        <Button testID="logout-button" title="Sign out" icon="logout" variant="secondary" onPress={async () => { await logout(); router.replace(PATH.LOGIN) }} style={{ marginTop: spacing.md }} />
        <VersionInfo />
      </ScrollView>
    </View>
  )
}
