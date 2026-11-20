import { useState } from "react"
import { ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { api, setToken } from "lib/api"
import { useAuth } from "state/auth"
import { Body, Button, Card, Field, Header, useToast } from "component/ui"
import { spacing, useTheme } from "design/theme"

export default function Password() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { refreshUser } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (next !== confirm) return toast("New passwords do not match", "error")
    setBusy(true)
    try {
      const result = await api<{ access_token: string }>("/account/password", { method: "POST", body: { current_password: current, new_password: next } })
      await setToken(result.access_token)
      await refreshUser()
      setCurrent("")
      setNext("")
      setConfirm("")
      toast("Password updated. Other sessions have been signed out.")
    } catch (error) { toast(error instanceof Error ? error.message : "Could not update password", "error") }
    finally { setBusy(false) }
  }
  return <View style={{ flex: 1, backgroundColor: colors.surface }}><Header title="Update password" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, width: "100%", maxWidth: 620, alignSelf: "center" }}>
      <Card style={{ gap: spacing.lg }}>
        <Body>Use at least 12 characters, up to 72 UTF-8 bytes. Updating your password signs out your other sessions.</Body>
        <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
        <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
        <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
        <Button title="Update password" loading={busy} disabled={!current || next.length < 12 || next !== confirm} onPress={save} />
      </Card>
    </ScrollView>
  </View>
}
