import { PATH } from 'route/path'
import { useRef, useState } from "react"
import { CameraView, useCameraPermissions } from "expo-camera"
import * as ImagePicker from "expo-image-picker"
import { Modal, ScrollView, View } from "react-native"
import { Image } from "expo-image"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { api, fileUrl, uploadPhoto } from "lib/api"
import { EquipmentSignature } from "component/equipment-signature"
import { isStaff, useAuth } from "state/auth"
import { fmtDate, useApi } from "lib/hooks"
import { Body, Button, Card, ErrorState, Field, H2, H3, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "component/ui"
import { makeStyles, radius, spacing, useTheme } from "design/theme"

const demoPhotos: Record<string, number> = {
  "COMP-001": require("../../assets/equipment/comp-001.jpg"),
  "COMP-002": require("../../assets/equipment/comp-002.jpg"),
  "REEL-001": require("../../assets/equipment/reel-001.jpg"),
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  photo: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
}))

function Photos({ paths }: { paths: string[] }) {
  const s = useStyles()
  if (!paths?.length) return null
  return (
    <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
      {paths.map((p) => <Image key={p} source={{ uri: fileUrl(p) }} style={s.photo} contentFit="cover" />)}
    </Row>
  )
}

export default function EquipmentDetail() {
  const s = useStyles()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useApi<any>(`/equipment/${id}`)
  const qr = useApi<any>(q.data ? `/qr?payload=${encodeURIComponent(q.data.code)}` : null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [, requestCameraPermission] = useCameraPermissions()
  const camera = useRef<CameraView>(null)
  const e = q.data
  const loan = e?.current_loan
  const equipmentPhoto = e?.photo_path
    ? { uri: fileUrl(e.photo_path) }
    : e ? demoPhotos[e.code] : undefined
  const canEdit = Boolean(e && !e.archived && user?.role === "admin")
  const canAddPhoto = canEdit || (!e?.archived && !equipmentPhoto &&
    user?.role === "manager" && user.warehouse_id === e?.warehouse_id)

  async function saveDetails() {
    if (!name.trim() || savingDetails) return
    setSavingDetails(true)
    try {
      await api(`/equipment/${id}`, {
        method: "PATCH",
        body: { name: name.trim(), serial_number: serialNumber.trim() },
      })
      await qc.invalidateQueries()
      setEditing(false)
      toast("Equipment details saved")
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save details", "error")
    } finally {
      setSavingDetails(false)
    }
  }

  async function savePhoto(uri: string) {
    const path = await uploadPhoto(uri)
    await api(`/equipment/${id}/photo`, { method: "PUT", body: { path } })
    await qc.invalidateQueries()
    toast("Equipment photo saved")
  }

  async function pickPhoto() {
    try {
      // Launch directly from the button so browsers allow the file picker.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.75 })
      if (result.canceled) return
      setBusy(true)
      await savePhoto(result.assets[0].uri)
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not upload photo", "error")
    } finally {
      setBusy(false)
    }
  }

  async function openCamera() {
    try {
      const permission = await requestCameraPermission()
      if (!permission.granted) {
        toast("Allow camera access or use Upload photo", "error")
        return
      }
      setCameraReady(false)
      setCameraOpen(true)
    } catch {
      toast("Camera unavailable. Use Upload photo instead.", "error")
    }
  }

  async function capturePhoto() {
    if (!camera.current || !cameraReady || busy) return
    setBusy(true)
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.75 })
      if (!photo) throw new Error("No photo captured")
      setCameraOpen(false)
      await savePhoto(photo.uri)
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not capture photo", "error")
    } finally {
      setBusy(false)
    }
  }

  const markAvailable = async () => {
    try {
      await api(`/equipment/${id}/available`, { method: "POST" })
      toast("Marked available")
      qc.invalidateQueries()
    } catch (err: any) {
      toast(err.message, "error")
    }
  }

  return (
    <View style={s.root} testID="equipment-detail-screen">
      <Modal visible={cameraOpen} onRequestClose={() => setCameraOpen(false)}>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: colors.surface }}>
          <CameraView
            ref={camera}
            facing="back"
            style={{ flex: 1 }}
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => {
              setCameraOpen(false)
              toast("Camera unavailable. Use Upload photo instead.", "error")
            }}
          />
          <Row style={{ padding: spacing.md, gap: spacing.sm }}>
            <Button title="Cancel" variant="ghost" onPress={() => setCameraOpen(false)} />
            <Button title="Capture photo" disabled={!cameraReady} loading={busy} onPress={capturePhoto} />
          </Row>
        </View>
      </Modal>
      <Header title={e?.code || "Equipment"} subtitle={e?.name} />
      {q.isLoading ? <Loading text="Loading equipment details…" /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : e && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ gap: spacing.sm }}>
            <Row style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 4 }}>
                <H2>{e.name}</H2>
                <Label>{e.category} · {e.warehouse_id}</Label>
                <Body>Serial number: {e.serial_number || "Not recorded"}</Body>
                <StatusPill testID="equipment-detail-status" status={e.overdue ? "overdue" : e.status} />
              </View>
              {qr.data && <Image source={{ uri: qr.data.data_uri }} style={{ width: 84, height: 84, borderRadius: radius.sm }} contentFit="contain" />}
            </Row>
            {equipmentPhoto ? (
              <Image
                source={equipmentPhoto}
                accessibilityLabel={e.name + " equipment photo"}
                style={{ width: "100%", maxWidth: 420, aspectRatio: 1.25, borderRadius: radius.sm }}
                contentFit="contain"
              />
            ) : <Label>No equipment photo yet</Label>}
            {canAddPhoto && (
              <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
                <Button title={equipmentPhoto ? "Change photo" : "Upload photo"} icon="image-plus" loading={busy} onPress={pickPhoto} />
                <Button title="Take photo" icon="camera" disabled={busy} onPress={openCamera} />
              </Row>
            )}
            {canEdit && (editing ? (
              <View style={{ gap: spacing.sm }}>
                <Field label="Equipment name" value={name} onChangeText={setName} maxLength={160} />
                <Field label="Serial number" value={serialNumber} onChangeText={setSerialNumber} maxLength={100} />
                <Row style={{ gap: spacing.sm, flexWrap: "wrap" }}>
                  <Button title="Save details" loading={savingDetails} disabled={!name.trim()} onPress={saveDetails} />
                  <Button title="Cancel" variant="ghost" disabled={savingDetails} onPress={() => setEditing(false)} />
                </Row>
              </View>
            ) : (
              <Button title="Edit equipment" icon="pencil" variant="ghost" onPress={() => {
                setName(e.name)
                setSerialNumber(e.serial_number || "")
                setEditing(true)
              }} />
            ))}
          </Card>

          <Button testID="equipment-map-button" title="View on warehouse map" icon="map-marker" variant="ghost"
            onPress={() => router.push({ pathname: PATH.WAREHOUSE_MAP, params: { equipment_id: e.id, wh: e.warehouse_id } })} />

          {loan && (
            <Card style={{ gap: spacing.sm, borderColor: e.overdue ? colors.error : colors.warning, borderWidth: 2 }} testID="equipment-current-loan">
              <Label>Currently signed out</Label>
              <H3>{loan.driller_name} · {loan.rig_number}</H3>
              <Body>Out {fmtDate(loan.checkout_at)} · due {fmtDate(loan.due_at)}</Body>
              <Row><Label>Condition out</Label><StatusPill status={loan.checkout_condition} /></Row>
              {!!loan.checkout_notes && <Body>{loan.checkout_notes}</Body>}
              <Photos paths={loan.checkout_photos} />
              {loan.collector_signature && <EquipmentSignature value={loan.collector_signature} />}
            </Card>
          )}

          {e.status === "available" && (
            <Button testID="equipment-checkout-button" large title="Sign out" icon="account-arrow-right" onPress={() => router.push({ pathname: PATH.EQUIPMENT_ACTION, params: { id: e.id, mode: "checkout" } })} />
          )}
          {e.status === "checked_out" && (
            <Button testID="equipment-return-button" large title="Sign back in" icon="keyboard-return" variant="success" onPress={() => router.push({ pathname: PATH.EQUIPMENT_ACTION, params: { id: e.id, mode: "return" } })} />
          )}
          {e.status === "maintenance" && (
            <Card style={{ gap: spacing.md }}>
              <Body>Returned damaged — in maintenance until a manager clears it.</Body>
              {isStaff(user) && <Button testID="equipment-mark-available" title="Mark available" icon="wrench-check" onPress={markAvailable} />}
            </Card>
          )}

          <H3>Borrowing history</H3>
          {e.history.length === 0 && <Body>No borrowing history yet.</Body>}
          {e.history.map((h: any) => (
            <Card key={h.id} testID={`equipment-history-${h.id}`} style={{ gap: spacing.xs }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Mono>{h.driller_name}</Mono>
                <StatusPill status={h.status === "out" && h.due_at < new Date().toISOString() ? "overdue" : h.status} />
              </Row>
              <Body>Rig {h.rig_number}</Body>
              <Row><Label>Out {fmtDate(h.checkout_at)}</Label><StatusPill status={h.checkout_condition} /></Row>
              {h.return_at && <Row><Label>In {fmtDate(h.return_at)}</Label><StatusPill status={h.return_condition} /></Row>}
              {!!h.return_notes && <Body>{h.return_notes}</Body>}
              <Photos paths={[...(h.checkout_photos || []), ...(h.return_photos || [])]} />
              {h.collector_signature ? <EquipmentSignature value={h.collector_signature} /> : <Label>No collector signature recorded</Label>}
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
