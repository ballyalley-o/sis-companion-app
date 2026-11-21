import { Platform } from "react-native"

export const usesNativeTab = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26

export const SIDEBAR_WIDTH = { expanded: 248, collapsed: 80 } as const
export const SIDEBAR_PREFERENCE_KEY = "sis_sidebar_collapsed"
