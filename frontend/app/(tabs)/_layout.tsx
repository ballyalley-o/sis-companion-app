import { Redirect, Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { Icon } from "@/src/ui";
import { fonts, useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  if (ready && !user) return <Redirect href="/login" />;

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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, borderTopWidth: 1, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.text, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarButtonTestID: "tab-home", tabBarIcon: ({ color }) => <Icon name="view-dashboard" size={26} color={color} /> }} />
      <Tabs.Screen name="stock" options={{ title: "Stock", tabBarButtonTestID: "tab-stock", tabBarIcon: ({ color }) => <Icon name="package-variant-closed" size={26} color={color} /> }} />
      <Tabs.Screen name="equipment" options={{ title: "Equipment", tabBarButtonTestID: "tab-equipment", tabBarIcon: ({ color }) => <Icon name="tools" size={26} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarButtonTestID: "tab-more", tabBarIcon: ({ color }) => <Icon name="menu" size={26} color={color} /> }} />
    </Tabs>
  );
}
