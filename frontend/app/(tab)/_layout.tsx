import { useEffect, useRef, useState, type ComponentProps }           from "react"
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { Image }                                                      from "expo-image"
import { Redirect, Tabs, useRouter }                                  from "expo-router"
import { NativeTabs }                                                 from "expo-router/unstable-native-tabs"
import { SIDEBAR_PREFERENCE_KEY, SIDEBAR_WIDTH, usesNativeTab }       from "config/navigation"
import { useAuth, type User }                                         from "state/auth"
import { PATH }                                                       from 'route/path'
import { VersionInfo }                                                from "component/version-info"
import { Body, Icon, Label, Loading }                                 from "component/ui"
import { fonts, makeStyles, spacing, useTheme }                       from "design/theme"
import { storage }                                                    from "util/storage"

const sidebarStyles = makeStyles((c) => ({
  root : { position: "relative", overflow: "visible", zIndex: 2, width: 248, height: "100%", flexGrow: 0, flexShrink: 0, backgroundColor: c.surfaceSecondary, borderRightWidth: 1, borderRightColor: c.border, padding: spacing.lg, gap: spacing.xl },
  brand: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  nav  : { gap: 6 },
  item : { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: 6 },
}))

type SidebarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0] & { user: User; collapsed: boolean; onToggle: () => void }

function DesktopSidebar({ state, descriptors, emitter, navigateToTab, user, collapsed, onToggle }: SidebarProps) {
  const router     = useRouter()
  const s          = sidebarStyles()
  const { colors } = useTheme()
  const destination = {
    index: PATH.TAB,
    stock: PATH.TAB_STOCK,
    equipment: PATH.TAB_EQUIPMENT,
    orders: PATH.TAB_ORDER,
    more: PATH.TAB_MORE,
  } as const
  const items      = state.routes.filter((route) => route.name in destination
    && !(user?.role === "driller" && descriptors[route.key]?.options?.title === "Orders"))
  return (
    <View testID="desktop-sidebar" style={[s.root, { width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded, paddingHorizontal: collapsed ? spacing.sm : spacing.lg }]} >
      <View style={[s.brand, { paddingHorizontal: 0, flexDirection: collapsed ? "column" : "row", gap: spacing.sm }]}>
        <Image source={require("../../asset/image/adaptive-icon.png")} accessibilityLabel="SIS logo" style={{ width: 36, height: 36 }} contentFit="contain" />
        {!collapsed && <View style={{ flex: 1, minWidth: 0 }}>
          <Body numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: 21, color: colors.onSurface }}>SIS Companion</Body>
        </View>}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.nav} showsVerticalScrollIndicator={false}>
        {items.map((route: any) => {
          const { options } = descriptors[route.key]
          const focused = state.routes[state.index]?.key === route.key
          const color = focused ? colors.onBrandPrimary : colors.onSurfaceSecondary
          const icon = options.tabBarIcon?.({ focused, color, size: 20 })
          return (
            <div key={route.key} title={collapsed ? String(options.title || route.name) : undefined}>
            <Pressable testID={`sidebar-${route.name}`} accessibilityRole="tab" accessibilityLabel={String(options.title || route.name)} accessibilityState={{ selected: focused }} onPress={() => {
              const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true })
              if (!focused && !event.defaultPrevented) navigateToTab(route.key)
            }} style={[s.item, collapsed && { justifyContent: "center", paddingHorizontal: 0 }, focused && { backgroundColor: colors.brandPrimary }]}>
              <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>{icon}</View>
              {!collapsed && <Body style={{ color, fontWeight: focused ? "800" : "600", fontSize: 14 }}>{String(options.title || route.name)}</Body>}
            </Pressable>
            </div>
          )
        })}
      </ScrollView>
      <View testID="sidebar-footer" style={{ flexShrink: 0, gap: spacing.md }}>
        <View style={{ position: "relative", paddingBottom: 40 }}>
          <div title={collapsed ? "Warehouse map" : undefined} style={{ width: "100%", display: "flex" }}>
            <Pressable testID="sidebar-warehouse-map" accessibilityRole="button" accessibilityLabel="Warehouse map" onPress={() => router.push(PATH.WAREHOUSE_MAP)} style={[s.item, { width: "100%" }, collapsed && { justifyContent: "center", paddingHorizontal: 0, gap: 0 }]}>
              <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}><Icon name="map-marker" size={26} color={colors.onSurfaceSecondary} /></View>
              {!collapsed && <Body style={{ color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: 14 }}>Warehouse map</Body>}
            </Pressable>
          </div>
          <Pressable testID="sidebar-toggle" accessibilityRole="button" accessibilityLabel={collapsed ? "Expand sidebar" : "Collapse sidebar"} accessibilityState={{ expanded: !collapsed }} onPress={onToggle} style={{ position: "absolute", right: -(collapsed ? spacing.sm : spacing.lg) - 16, bottom: 0, width: 32, height: 32, zIndex: 10, backgroundColor: "transparent", alignItems: "center", justifyContent: "center" }}>
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={23} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>
        {!collapsed && <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, paddingHorizontal: spacing.sm, gap: spacing.sm }}>
          <Label>STOCK OPERATIONS</Label>
          <VersionInfo compact />
        </View>}
      </View>
    </View>
  )
}

export default function TabsLayout() {
  const { user, ready }           = useAuth()
  const { colors }                = useTheme()
  const { width }                 = useWindowDimensions()
  const desktop                   = Platform.OS === "web" && width >= 1000
  const [collapsed, setCollapsed] = useState(false)
  const preferenceChanged         = useRef(false)
  useEffect(() => {
    if (Platform.OS !== "web") return
    let active = true
    storage.getItem<boolean>(SIDEBAR_PREFERENCE_KEY, false).then(value => {
      if (active && !preferenceChanged.current) setCollapsed(value === true)
    })
    return () => { active = false }
  }, [])
  const toggleSidebar = () => {
    preferenceChanged.current = true
    const next = !collapsed
    setCollapsed(next)
    void storage.setItem(SIDEBAR_PREFERENCE_KEY, next)
  }
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>
  if (!user) return <Redirect href={PATH.LOGIN} />

  if (usesNativeTab) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="stock">
          <NativeTabs.Trigger.Icon sf="shippingbox.fill" />
          <NativeTabs.Trigger.Label>Stock</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="equipment">
          <NativeTabs.Trigger.Icon sf="wrench.and.screwdriver.fill" />
          <NativeTabs.Trigger.Label>Equipment</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Icon sf="line.3.horizontal" />
          <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    )
  }

  return (
    <Tabs
      tabBar={desktop ? (props) => <DesktopSidebar {...props} user={user} collapsed={collapsed} onToggle={toggleSidebar} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarPosition: desktop ? "left" : "bottom",
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: desktop
          ? { width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded, backgroundColor: colors.surfaceSecondary, borderRightColor: colors.border, borderRightWidth: 1, borderTopWidth: 0 }
          : { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, borderTopWidth: 1, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.text, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarButtonTestID: "tab-home", tabBarIcon: ({ color }) => <Icon name="view-dashboard" size={26} color={color} /> }} />
      <Tabs.Screen name="stock" options={{ title: "Stock", tabBarButtonTestID: "tab-stock", tabBarIcon: ({ color }) => <Icon name="package-variant-closed" size={26} color={color} /> }} />
      <Tabs.Screen name="equipment" options={{ title: "Equipment", tabBarButtonTestID: "tab-equipment", tabBarIcon: ({ color }) => <Icon name="tools" size={26} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", href: user?.role === "driller" ? null : PATH.TAB_ORDER, tabBarButtonTestID: "tab-orders", tabBarIcon: ({ color }) => <Icon name="clipboard-list-outline" size={26} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarButtonTestID: "tab-more", tabBarIcon: ({ color }) => <Icon name="menu" size={26} color={color} /> }} />
    </Tabs>
  )
}
