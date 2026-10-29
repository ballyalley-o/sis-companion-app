import { Redirect, Tabs, useRouter } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { Body, Icon, Label, Loading } from "@/src/ui";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";

const sidebarStyles = makeStyles((c) => ({
  root: { width: 248, height: "100%", flexGrow: 0, flexShrink: 0, backgroundColor: c.surfaceSecondary, borderRightWidth: 1, borderRightColor: c.border, padding: spacing.lg, gap: spacing.xl },
  brand: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, gap: 6 },
  nav: { gap: 6 },
  item: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: 6 },
}));

function DesktopSidebar({ state, descriptors, navigation, user }: any) {
  const router = useRouter();
  const s = sidebarStyles();
  const { colors } = useTheme();
  const items = state.routes.filter((route: any) => descriptors[route.key]?.options?.href !== null
    && !(user?.role === "driller" && descriptors[route.key]?.options?.title === "Orders"));
  return (
    <View style={s.root}>
      <View style={s.brand}>
        <Body style={{ fontFamily: fonts.display, fontSize: 23, color: colors.onSurface }}>DRILLSTOCK PRO</Body>
        <Label>WAREHOUSE WORKSPACE</Label>
      </View>
      <View style={s.nav}>
        {items.map((route: any) => {
          const { options } = descriptors[route.key];
          const focused = state.routes[state.index]?.key === route.key;
          const color = focused ? colors.onBrandPrimary : colors.onSurfaceSecondary;
          const icon = options.tabBarIcon?.({ focused, color, size: 20 });
          return (
            <Pressable key={route.key} onPress={() => navigation.navigate(route.name)} style={[s.item, focused && { backgroundColor: colors.brandPrimary }]}>
              {icon}
              <Body style={{ color, fontWeight: focused ? "800" : "600", fontSize: 14 }}>{String(options.title || route.name)}</Body>
            </Pressable>
          );
        })}
        <Pressable testID="sidebar-warehouse-map" onPress={() => router.push("/warehouse-map")} style={s.item}>
          <Icon name="map-marker" size={20} color={colors.onSurfaceSecondary} />
          <Body style={{ color: colors.onSurfaceSecondary, fontWeight: "600", fontSize: 14 }}>Warehouse map</Body>
        </Pressable>
      </View>
      <View style={{ marginTop: "auto", padding: spacing.sm }}><Label>QLD · NSW STOCK OPERATIONS</Label></View>
    </View>
  );
}

export default function TabsLayout() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1000;
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading /></View>;
  if (!user) return <Redirect href="/login" />;

  if (usesNativeTabs) {
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
    );
  }

  return (
    <Tabs
      tabBar={desktop ? (props) => <DesktopSidebar {...props} user={user} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarPosition: desktop ? "left" : "bottom",
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: desktop
          ? { width: 248, backgroundColor: colors.surfaceSecondary, borderRightColor: colors.border, borderRightWidth: 1, borderTopWidth: 0 }
          : { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, borderTopWidth: 1, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.text, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarButtonTestID: "tab-home", tabBarIcon: ({ color }) => <Icon name="view-dashboard" size={26} color={color} /> }} />
      <Tabs.Screen name="stock" options={{ title: "Stock", tabBarButtonTestID: "tab-stock", tabBarIcon: ({ color }) => <Icon name="package-variant-closed" size={26} color={color} /> }} />
      <Tabs.Screen name="equipment" options={{ title: "Equipment", tabBarButtonTestID: "tab-equipment", tabBarIcon: ({ color }) => <Icon name="tools" size={26} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", href: user?.role === "driller" ? null : "/(tabs)/orders", tabBarButtonTestID: "tab-orders", tabBarIcon: ({ color }) => <Icon name="clipboard-list-outline" size={26} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarButtonTestID: "tab-more", tabBarIcon: ({ color }) => <Icon name="menu" size={26} color={color} /> }} />
    </Tabs>
  );
}
