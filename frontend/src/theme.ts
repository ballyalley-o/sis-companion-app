// Design tokens for DrillStock Pro. Dark-first rugged utility theme
// (values from /app/design_guidelines.json). Components import colors via
// useTheme() or makeStyles(); never write color literals in components.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#121212",
  onSurface: "#F2F2F2",
  surfaceSecondary: "#242424",
  onSurfaceSecondary: "#E0E0E0",
  surfaceTertiary: "#333333",
  onSurfaceTertiary: "#CCCCCC",
  surfaceInverse: "#EEEEEE",
  onSurfaceInverse: "#121212",
  muted: "#8A8A8A",

  brand: "#FFD600",
  onBrand: "#121212",
  brandPrimary: "#FFD600",
  onBrandPrimary: "#121212",
  brandSecondary: "#E5C000",
  onBrandSecondary: "#121212",
  brandTertiary: "#4D4100",
  onBrandTertiary: "#FFD600",

  success: "#00E676",
  onSuccess: "#000000",
  warning: "#FF9100",
  onWarning: "#000000",
  error: "#FF3D00",
  onError: "#000000",
  info: "#40C4FF",
  onInfo: "#000000",

  border: "#3A3A3A",
  borderStrong: "#5A5A5A",
  divider: "#2A2A2A",
  scrim: "rgba(0,0,0,0.75)",
  overlay: "rgba(0,0,0,0.6)",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

// Dark-only industrial app: both schemes map to the dark palette.
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" || system === "dark" ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? dark };
}

export const colors = dark;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fonts = {
  display: "BarlowCondensed-Bold",
  displaySemi: "BarlowCondensed-SemiBold",
  text: "Manrope",
};

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
