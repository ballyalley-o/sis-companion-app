import { Image } from "expo-image"
import { useState }                                                                                                              from "react"
import { FlatList, Linking, Text, View }                                                                                                        from "react-native"
import { useQueryClient }                                                                                                        from "@tanstack/react-query"
import { KeyboardAwareScrollView }                                                                                               from "react-native-keyboard-controller"
import { useSafeAreaInsets }                                                                                                     from "react-native-safe-area-context"
import { api, publicJoinUrl }                                                                                                                   from "lib/api"
import { useApi }                                                                                                                from "lib/hook"
import { Body, Button, Card, Chip, ErrorState, Field, H3, Header, IconButton, Label, Loading, Row, Sheet, StatusPill, useToast } from "component/ui"
import { makeStyles, spacing, useTheme }                                                                                         from "design/theme"

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }))

type JoinRequest = { id: string; name: string; email: string; warehouse_id: string }

export default function Users() {
  const s               = useStyles()
  const { colors }      = useTheme()
  const insets          = useSafeAreaInsets()
  const joinUrl = publicJoinUrl
  const toast           = useToast()
  const qc              = useQueryClient()
  const q               = useApi<any[]>("/users")
  const [open, setOpen] = useState(false)
  const [f, setF]       = useState({ name: "", email: "", password: "", role: "driller", warehouse_id: "QLD" })
  const [busy, setBusy] = useState(false)

  const requests = useApi<JoinRequest[]>("/join-requests")
  const qr = useApi<{ data_uri: string }>(joinUrl ? `/qr?payload=${encodeURIComponent(joinUrl)}` : null)
  const [approval, setApproval] = useState<JoinRequest | null>(null)
  const [approvalPassword, setApprovalPassword] = useState("")
  const [approving, setApproving] = useState(false)

  const approve = async () => {
    if (!approval || approving) return
    setApproving(true)
    try {
      await api(`/join-requests/${approval.id}/approve`, {
        method: "POST",
        body: { password: approvalPassword },
      })
      setApproval(null)
      setApprovalPassword("")
      await qc.invalidateQueries()
      toast("Driller account created. Share the temporary password privately.")
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not approve request", "error")
    } finally {
      setApproving(false)
    }
  }

  const create = async () => {
    setBusy(true)
    try {
      await api("/users", { method: "POST", body: { ...f, warehouse_id: f.role === "admin" ? null : f.warehouse_id } })
      toast(`${f.name} added`)
      setOpen(false)
      setF({ name: "", email: "", password: "", role: "driller", warehouse_id: "QLD" })
      qc.invalidateQueries()
    } catch (e: any) { toast(e.message, "error") } finally { setBusy(false) }
  }
  const toggle = async (u: any) => {
    try {
      await api(`/users/${u.id}/toggle`, { method: "PATCH" })
      qc.invalidateQueries()
    } catch (e: any) { toast(e.message, "error") }
  }

  return (
    <View style={s.root} testID="users-screen">
      <Header title="Users" subtitle="Roles & warehouse access" right={<IconButton testID="users-new-button" icon="account-plus" onPress={() => setOpen(true)} />} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <FlatList data={q.data} keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          ListHeaderComponent={(
            <Card style={{ gap: spacing.md }}>
              <H3>Driller join requests</H3>
              <Body>Share this QR so drillers can request an account without opening the private app.</Body>
              {joinUrl && (
                <>
                  {qr.data && <Image source={{ uri: qr.data.data_uri }} accessibilityLabel="QR code for the driller request form" style={{ width: 160, height: 160 }} />}
                  {qr.isError && <Button title="Retry QR" variant="ghost" onPress={() => qr.refetch()} />}
                  <Text selectable style={{ color: colors.onSurface }}>{joinUrl}</Text>
                  <Button title="Open public request form" variant="ghost" onPress={() => { Linking.openURL(joinUrl).catch(() => toast("Could not open request form", "error")) }} />
                </>
              )}
              {!joinUrl && <Body>Set the backend URL to display the public QR.</Body>}
              {requests.isLoading ? <Loading /> : requests.isError ? (
                <ErrorState message={requests.error.message} onRetry={requests.refetch} />
              ) : requests.data?.length ? requests.data.map((request) => (
                <Row key={request.id} style={{ gap: spacing.sm, flexWrap: "wrap" }}>
                  <View style={{ flex: 1 }}>
                    <Body>{request.name}</Body>
                    <Label>{request.email} · {request.warehouse_id}</Label>
                  </View>
                  <Button title="Review" variant="ghost" onPress={() => { setApprovalPassword(""); setApproval(request) }} />
                </Row>
              )) : <Body>No pending requests.</Body>}
            </Card>
          )}
          renderItem={({ item: u }) => (
            <Card testID={`user-card-${u.email}`} style={!u.active ? { opacity: 0.5 } : undefined}>
              <Row>
                <View style={{ flex: 1, gap: 2 }}>
                  <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{u.name}</Body>
                  <Body style={{ fontSize: 13 }}>{u.email}</Body>
                  <Row style={{ gap: spacing.sm }}>
                    <StatusPill status={u.role === "admin" ? "live" : u.role === "manager" ? "open" : "take"} label={u.role} />
                    {u.warehouse_id && <Label>{u.warehouse_id}</Label>}
                  </Row>
                </View>
                <IconButton testID={`user-toggle-${u.email}`} icon={u.active ? "account-cancel" : "account-check"} onPress={() => toggle(u)} />
              </Row>
            </Card>
          )} />
      )}
      <Sheet visible={Boolean(approval)} onClose={() => { if (!approving) setApproval(null) }} testID="join-approval-sheet">
        <H3>Approve driller</H3>
        <Body>{approval?.name} · {approval?.email} · {approval?.warehouse_id}</Body>
        <Field label="Temporary password" placeholder="At least 12 characters" secureTextEntry value={approvalPassword} onChangeText={setApprovalPassword} />
        <Button title="Approve and create account" loading={approving} disabled={approvalPassword.length < 12} onPress={approve} />
      </Sheet>
      <Sheet visible={open} onClose={() => setOpen(false)} testID="new-user-sheet">
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
          <H3>Add user</H3>
          <Field testID="user-name-input" placeholder="Full name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Field testID="user-email-input" placeholder="Email" value={f.email} autoCapitalize="none" keyboardType="email-address" onChangeText={(v) => setF({ ...f, email: v })} />
          <Field testID="user-password-input" placeholder="Temporary password (8+ chars)" value={f.password} secureTextEntry onChangeText={(v) => setF({ ...f, password: v })} />
          <Label>Role</Label>
          <Row style={{ gap: spacing.sm }}>
            {["driller", "manager", "admin"].map((r) => <Chip key={r} testID={`user-role-${r}`} label={r} selected={f.role === r} onPress={() => setF({ ...f, role: r })} />)}
          </Row>
          {f.role !== "admin" && (
            <>
              <Label>Home warehouse</Label>
              <Row style={{ gap: spacing.sm }}>
                {["QLD", "NSW"].map((w) => <Chip key={w} testID={`user-wh-${w}`} label={w} selected={f.warehouse_id === w} onPress={() => setF({ ...f, warehouse_id: w })} />)}
              </Row>
            </>
          )}
          <Button testID="user-create-button" title="Create user" icon="account-plus" loading={busy} onPress={create} />
        </KeyboardAwareScrollView>
      </Sheet>
    </View>
  )
}
