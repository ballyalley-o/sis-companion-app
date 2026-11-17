import Constants from "expo-constants"

const release = Constants.expoConfig?.extra?.release

// Build metadata is embedded during export, not derived from the viewer's clock.
export const RELEASE = {
  version: release?.version || Constants.expoConfig?.version || "unknown",
  commit : typeof release?.commit === "string" ? release.commit          : null,
  dirty  : release?.dirty === true,
  builtAt: typeof release?.builtAt === "string" ? release.builtAt        : null,
} as const
