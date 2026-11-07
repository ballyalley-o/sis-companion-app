import { Platform } from "react-native"

export const usesNativeTab = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26
