import { Text, View } from "react-native"
import { RELEASE } from "config/release.config"
import { fonts, spacing, useTheme } from "design/theme"

export function VersionInfo({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme()
  const build = RELEASE.commit ? RELEASE.commit.slice(0, 7) : "unidentified build"
  return (
    <View testID="app-version" style={{ gap: spacing.xs }}>
      <Text selectable style={{ color: colors.muted, fontSize: 10, fontFamily: fonts.text }}>
        {`SIS Companion · v${RELEASE.version} · ${build}${RELEASE.dirty ? " · modified" : ""}`}
      </Text>
      {!compact && RELEASE.builtAt && <Text selectable style={{ color: colors.muted, fontSize: 10, fontFamily: fonts.text }}>Built {RELEASE.builtAt} (UTC)</Text>}
    </View>
  )
}
