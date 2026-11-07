import { PATH } from 'route/path'
import { Redirect } from "expo-router"
import { View } from "react-native"
import { useAuth } from "state/auth"
import { Loading } from "component/ui"
import { useTheme } from "design/theme"

export default function Index() {
  const { user, ready } = useAuth()
  const { colors } = useTheme()
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.surface }}><Loading text="Starting up…" /></View>
  return <Redirect href={user ? PATH.TABS : PATH.LOGIN} />
}
