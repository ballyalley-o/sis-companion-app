import { useEffect, useState }                                                                                                   from "react"
import { FlatList, Share, Text, View, useWindowDimensions }                                                                      from "react-native"
import { Image }                                                                                                                 from "expo-image"
import { useQueryClient }                                                                                                        from "@tanstack/react-query"
import { KeyboardAwareScrollView }                                                                                               from "react-native-keyboard-controller"
import { useSafeAreaInsets }                                                                                                     from "react-native-safe-area-context"
import { api, publicJoinUrl }                                                                                                    from "lib/api"
import { useApi }                                                                                                                from "lib/hook"
import { Body, Button, Card, Chip, ErrorState, Field, H3, Header, IconButton, Label, Loading, Row, Sheet, StatusPill, useToast } from "component/ui"
import { makeStyles, spacing, useTheme }                                                                                         from "design/theme"

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }))

type JoinRequest = { id: string; name: string; email: string; warehouse_id: string }

export default function Users() {
  const s                           = useStyles()
  const { colors }                  = useTheme()
  const insets                      = useSafeAreaInsets()
  const { width }                   = useWindowDimensions()
  const compact                     = width < 760
  const joinUrl                     = publicJoinUrl
  const [inviteOpen, setInviteOpen] = useState(false)
  const toast                       = useToast()
  const qc                          = useQueryClient()
  const q                           = useApi<any[]>("/users")
  const [open, setOpen]             = useState(false)
  const [f, setF]                   = useState({ name: "", email: "", password: "", role: "driller", warehouse_id: "QLD" })
  const [busy, setBusy]             = useState(false)

  const requests                    = useApi<JoinRequest[]>("/join-requests")
  const qr                          = useApi<{ data_uri: string }>(inviteOpen && joinUrl ? `/qr?payload=${encodeURIComponent(joinUrl)}` : null)
  const { refetch: refreshRequest } = requests
  useEffect(() => {
    const timer = setInterval(() => { void refreshRequest() }, 15000)
    return () => clearInterval(timer)
  }, [refreshRequest])

  const invite = async () => {
    if (!joinUrl) return
    try {
      await Share.share({
        title: "Join SIS Companion",
        message: `You’re invited to request access to SIS Companion. Submit your details here: ${joinUrl} — an SIS administrator will review your request.`,
      })
    } catch {
      toast("Could not share invite. You can copy the link below.", "error")
    }
  }

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
          refreshing={requests.isFetching}
          onRefresh={() => { void refreshRequest(); void q.refetch() }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          ListHeaderComponent={(
            <Card style={{ gap: spacing.md }}>
              <Row style={{ gap: spacing.sm, flexWrap: "wrap" }}>
                <View style={{ flex: 1, minWidth: 180, gap: spacing.xs }}>
                  <H3>Pending access requests</H3>
                  <Label style={{ color: colors.brandPrimary }}>{requests.data?.length ?? 0} awaiting review</Label>
                </View>
                <Button title="Invite driller" icon="account-plus" onPress={() => setInviteOpen(true)} />
                <Button title="Refresh" variant="ghost" loading={requests.isFetching} onPress={() => { void refreshRequest() }} />
              </Row>
              <Body>Review access requests here. This list refreshes every 15 seconds. Existing account emails do not appear as pending requests.</Body>
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                {!compact && (
                  <Row style={{ padding: spacing.lg, backgroundColor: colors.surfaceTertiary, gap: spacing.md }}>
                    <Label style={{ flex: 2 }}>Applicant</Label>
                    <Label style={{ flex: 1 }}>Warehouse</Label>
                    <Label style={{ width: 140 }}>Action</Label>
                  </Row>
                )}
                {requests.isLoading ? <Loading /> : requests.isError ? (
                  <ErrorState message={requests.error.message} onRetry={requests.refetch} />
                ) : requests.data?.length ? requests.data.map((request, index) => (
                  <Row key={request.id} style={{ padding: spacing.lg, gap: spacing.md, flexWrap: compact ? "wrap" : "nowrap", borderTopWidth: index > 0 || !compact ? 1 : 0, borderColor: colors.border }}>
                    <View style={{ flex: 2, minWidth: compact ? 180 : 0, gap: spacing.xs }}>
                      <Body style={{ color: colors.onSurface, fontWeight: "700" }}>{request.name}</Body>
                      <Body style={{ fontSize: 13 }}>{request.email}</Body>
                      {compact && <Label>{request.warehouse_id}</Label>}
                    </View>
                    {!compact && <Label style={{ flex: 1 }}>{request.warehouse_id}</Label>}
                    <View style={{ width: 140 }}>
                      <Button title="Review" variant="ghost" onPress={() => { setApprovalPassword(""); setApproval(request) }} />
                    </View>
                  </Row>
                )) : <View style={{ padding: spacing.xl }}><Body>No pending requests.</Body></View>}
              </View>

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
      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} testID="invite-driller-sheet">
        <H3>Invite driller</H3>
        <Body>Share this invitation link or let the driller scan the QR code. They submit their details and wait for admin approval.</Body>
        {joinUrl ? (
          <>
            {qr.isLoading && <Loading />}
            {qr.data && <Image source={{ uri: qr.data.data_uri }} accessibilityLabel="Driller invitation QR code" style={{ width: 160, height: 160 }} />}
            {qr.isError && <ErrorState message={qr.error.message} onRetry={qr.refetch} />}
            <Text selectable style={{ color: colors.onSurface }}>{joinUrl}</Text>
            <Button title="Share invite" icon="share-variant" onPress={invite} />
          </>
        ) : <Body>Configure the public backend URL before sharing an invitation.</Body>}
      </Sheet>
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
