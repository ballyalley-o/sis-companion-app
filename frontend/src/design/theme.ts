// SIS Companion design tokens. Use useTheme() or makeStyles() in components.

import { useMemo } from "react"
import { Appearance, StyleSheet, useColorScheme } from "react-native"

export type ColorScheme = "light" | "dark"

const dark = {
    surface: "#1C2228",
    onSurface: "#F2F2F2",
    surfaceSecondary: "#262D35",
    onSurfaceSecondary: "#E0E0E0",
    surfaceTertiary: "#323841",
    onSurfaceTertiary: "#CCCCCC",
    surfaceInverse: "#EEEEEE",
    onSurfaceInverse: "#1C2228",
    muted: "#8A8A8A",

    brand: "#F5AD00",
    onBrand: "#1C2228",
    brandPrimary: "#F5AD00",
    onBrandPrimary: "#1C2228",
    brandSecondary: "#F0BE69",
    onBrandSecondary: "#1C2228",
    brandTertiary: "#503A16",
    onBrandTertiary: "#F5AD00",

    success: "#00E676",
    onSuccess: "#000000",
    warning: "#FF9100",
    onWarning: "#000000",
    error: "#FF3D00",
    onError: "#000000",
    info: "#40C4FF",
    onInfo: "#000000",

    border: "#3C4550",
    borderStrong: "#5C6875",
    divider: "#323841",
    scrim: "rgba(0,0,0,0.75)",
    overlay: "rgba(0,0,0,0.6)",
}

export type ThemeColors = typeof dark

export const defaultScheme = "dark" satisfies ColorScheme

// Dark-only industrial app: both schemes map to the dark palette.
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark }

export function setColorScheme(scheme: ColorScheme | null) {
    Appearance.setColorScheme?.(scheme ?? "unspecified")
}

setColorScheme?.("dark")

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
    const system = useColorScheme()
    const scheme: ColorScheme = system === "light" || system === "dark" ? system : defaultScheme
    return { scheme, colors: themes[scheme] ?? dark }
}

export const colors = dark

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 }
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 }
export const fonts = {
    display: "BarlowCondensed-Bold",
    displaySemi: "BarlowCondensed-SemiBold",
    text: "Manrope",
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
    factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
    return function useStyles(): T {
        const { colors } = useTheme()
        return useMemo(() => StyleSheet.create(factory(colors)), [colors])
    }
}
