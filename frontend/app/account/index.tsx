import { useEffect, useState } from "react"
import { ScrollView, View, useWindowDimensions } from "react-native"
import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import { api, fileUrl, setToken, uploadPhoto } from "lib/api"
import { useApi, fmtDate } from "lib/hook"
import { roleLabel, useAuth } from "state/auth"
import { PATH } from "route/path"
import { Body, Button, Card, ErrorState, Field, H3, Header, Icon, Label, Loading, Row, Sheet, ChipRow, StatusPill, useToast } from "component/ui"
import { radius, spacing, useTheme } from "design/theme"

export default function Account() {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const { user, refreshUser } = useAuth()
  const administrator = user?.role === "admin"
  const rig = useApi<any[]>(administrator ? "/rig-accounts" : null)
  const [editAccess, setEditAccess] = useState(false)
  const [accessRole, setAccessRole] = useState("admin")
  const [accessWarehouse, setAccessWarehouse] = useState("")
  const [accessRig, setAccessRig] = useState("")
  const q = useApi<any>("/account")
  const [name, setName] = useState("")
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) { setName(q.data.user.name); setPhoto(q.data.user.photo_path || null) } }, [q.data])
  const choosePhoto = async () => {
    setBusy(true)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) return toast("Allow photo access to choose a picture", "info")
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.75 })
      if (!result.canceled) setPhoto(await uploadPhoto(result.assets[0].uri))
    } catch (error) { toast(error instanceof Error ? error.message : "Could not upload photo", "error") }
    finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true)
    try {
      await api("/account", { method: "PATCH", body: { name: name.trim(), photo_path: photo } })
      await refreshUser()
      await qc.invalidateQueries()
      toast("Profile updated")
    } catch (error) { toast(error instanceof Error ? error.message : "Could not save profile", "error") }
    finally { setBusy(false) }
  }
  const openAccess = () => {
    setAccessRole(q.data.user.role)
    setAccessWarehouse(q.data.user.warehouse_id || "")
    setAccessRig(q.data.user.rig_id || "")
    setEditAccess(true)
  }
  const saveAccess = async () => {
    setBusy(true)
    try {
      const result = await api<{ access_token?: string }>(`/users/${user?.id}/assignment`, { method: "PATCH", body: { role: accessRole, warehouse_id: accessWarehouse || null, rig_id: accessRig || null } })
      if (result.access_token) await setToken(result.access_token)
      await refreshUser()
      setEditAccess(false)
      await qc.invalidateQueries()
      toast("Account details updated")
    } catch (error) { toast(error instanceof Error ? error.message : "Could not update account", "error") }
    finally { setBusy(false) }
  }
  const d = q.data
  return <View style={{ flex: 1, backgroundColor: colors.surface }}>
    <Header title="My account" subtitle="Profile & access" />
    {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={q.error.message} onRetry={q.refetch} /> : d && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: width >= 900 ? spacing.xxl : spacing.lg, paddingBottom: insets.bottom + spacing.xxl, width: "100%", maxWidth: 1240, alignSelf: "center", gap: spacing.xl }}>
      <View style={{ flexDirection: width >= 900 ? "row" : "column", gap: spacing.xl }}>
        <Card style={{ flex: 1, minWidth: 0, gap: spacing.xl, padding: spacing.xl }}>
          <H3>Profile</H3>
          {photo ? <Image source={{ uri: fileUrl(photo) }} accessibilityLabel="Your profile photo" style={{ width: 112, height: 112, borderRadius: radius.md }} /> : <Icon name="account-circle" size={96} color={colors.muted} />}
          <Row style={{ flexWrap: "wrap" }}>
            <Button title={photo ? "Change photo" : "Upload photo"} variant="secondary" onPress={choosePhoto} disabled={busy} />
            {photo && <Button title="Remove photo" variant="ghost" onPress={() => setPhoto(null)} disabled={busy} />}
          </Row>
          <Field label="Full name" value={name} onChangeText={setName} maxLength={100} />
          <Body>Choose your picture and update your name, then save your profile.</Body>
          <Button title="Save profile" onPress={save} loading={busy} disabled={!name.trim()} />
        </Card>
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xl }}>
          <Card style={{ gap: spacing.xl, padding: spacing.xl }}>
            <H3>Account details</H3>
            <View style={{ gap: spacing.sm }}><Label>Email</Label><Body>{d.user.email}</Body></View>
            <View style={{ gap: spacing.sm }}><Label>Role</Label><Body>{roleLabel(d.user.role)}</Body></View>
            <View style={{ gap: spacing.sm }}><Label>Status</Label><StatusPill status={d.user.active ? "available" : "cancelled"} label={d.user.active ? "Active" : "Inactive"} /></View>
            <View style={{ gap: spacing.sm }}><Label>Home warehouse</Label><Body>{d.user.warehouse_id || "All warehouses"}</Body></View>
            <View style={{ gap: spacing.sm }}><Label>Member since</Label><Body>{fmtDate(d.user.created_at)}</Body></View>
            {administrator && <Button title="Edit account details" variant="secondary" onPress={openAccess} />}
            <Button title="Update password" variant="secondary" onPress={() => router.push(PATH.ACCOUNT_PASSWORD)} />
          </Card>
          <Card style={{ gap: spacing.xl, padding: spacing.xl }}>
            <View style={{ gap: spacing.sm }}><H3>My rig</H3><Body>{d.rig?.number || "No rig assigned"}</Body></View>
            <View style={{ gap: spacing.sm }}><Label>Base area</Label><Body>{d.rig?.base_area || "Not recorded"}</Body></View>
            <View style={{ gap: spacing.sm }}><Label>Senior drilling manager</Label><Body>{d.supervisor?.name || "Not assigned"}</Body></View>
            {d.rig ? <Button title={administrator ? "View / edit rig details" : "View rig account"} onPress={() => router.push({ pathname: PATH.RIG_DETAIL, params: { id: d.rig.id } })} /> : <Body>Ask an administrator to assign your rig.</Body>}
          </Card>
        </View>
      </View>
    </ScrollView>}
    <Sheet visible={editAccess} onClose={() => { if (!busy) setEditAccess(false) }}>
      <H3>Edit account details</H3>
      <Label>Role</Label>
      <ChipRow testIDPrefix="account-role" value={accessRole} onChange={setAccessRole} options={["driller", "manager", "senior_drilling_manager", "general_manager", "administrator_2", "admin"].map(value => ({ value, label: roleLabel(value) }))} />
      <Label>Home warehouse</Label>
      <ChipRow testIDPrefix="account-warehouse" value={accessWarehouse} onChange={value => { setAccessWarehouse(value); setAccessRig("") }} options={[...(["admin", "general_manager", "administrator_2"].includes(accessRole) ? [""] : []), "QLD", "NSW"].map(value => ({ value, label: value || "All warehouses" }))} />
      <Label>Assigned rig</Label>
      {rig.isError ? <ErrorState message={rig.error.message} onRetry={rig.refetch} /> : <ChipRow testIDPrefix="account-rig" value={accessRig} onChange={setAccessRig} options={[{ value: "", label: "Unassigned" }, ...(rig.data || []).filter(r => r.warehouse_id === accessWarehouse).map(r => ({ value: r.id, label: r.number }))]} />}
      <Body>Email and member-since are read-only. Another administrator must change your own administrator privileges or deactivate your account.</Body>
      <Button title="Save account details" loading={busy} onPress={saveAccess} />
    </Sheet>
  </View>
}
