import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { Body, Icon, Label } from "@/src/ui";
import { spacing, useTheme } from "@/src/theme";

export function googleMapsUrl(address: string, directions = false): string | null {
  const destination = address.trim();
  if (!destination) return null;
  const encoded = encodeURIComponent(destination);
  return directions
    ? `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function MapsLink({ href, testID, label, children }: { href: string; testID: string; label: string; children: ReactNode }) {
  if (Platform.OS === "web") {
    return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} data-testid={testID}
      onClick={(event) => event.stopPropagation()}
      style={{ display: "flex", alignItems: "center", gap: spacing.sm, minHeight: 44, textDecoration: "none", minWidth: 0 }}>
      {children}
    </a>;
  }
  return <Link href={href as any} asChild>
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={label}
      onPress={(event) => event.stopPropagation()} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 }}>
      {children}
    </Pressable>
  </Link>;
}

/** Addresses are shared with Google only when a user opens a link. */
export function GoogleMapsAddress({ address, directions = true, testID = "trip-address" }: {
  address?: string; directions?: boolean; testID?: string;
}) {
  const { colors } = useTheme();
  const url = googleMapsUrl(address || "");
  if (!url) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <MapsLink href={url} testID={`${testID}-map`} label={`View ${address?.trim()} in Google Maps`}>
          <Icon name="map-marker-outline" size={22} color={colors.brandPrimary} />
          <Body style={{ flex: 1, color: colors.brandPrimary, textDecorationLine: "underline" }}>{address?.trim()}</Body>
          <Icon name="open-in-new" size={17} color={colors.muted} />
      </MapsLink>
      {directions && <MapsLink href={googleMapsUrl(address || "", true)!} testID={`${testID}-directions`} label={`Get Google Maps directions to ${address?.trim()}`}>
          <Icon name="directions" size={20} color={colors.brandPrimary} /><Label style={{ color: colors.brandPrimary }}>Get directions</Label>
      </MapsLink>}
    </View>
  );
}
