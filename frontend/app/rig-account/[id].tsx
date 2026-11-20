import { useEffect, useState } from "react"
import { ScrollView, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "lib/api"
import { fmtDate, useApi } from "lib/hook"
import { isStaff, isRegionalManager, roleLabel, useAuth } from "state/auth"
import { PATH } from "route/path"
import { Body, Button, Card, ChipRow, EmptyState, ErrorState, Field, H3, Header, Label, Loading, Mono, Row, Sheet, StatusPill, useToast } from "component/ui"
import { spacing, useTheme } from "design/theme"

export default function RigAccount() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const staff = isStaff(user)
  const q = useApi<any>(`/rig-accounts/${id}`)
  const supervisors = useApi<any[]>(staff ? "/rig-supervisors" : null)
  const [tab, setTab] = useState("overview")
  const [edit, setEdit] = useState(false)
  const [base, setBase] = useState("")
  const [warehouse, setWarehouse] = useState("QLD")
  const [supervisor, setSupervisor] = useState("")
  const [palletOpen, setPalletOpen] = useState(false)
  const [pallet, setPallet] = useState<any>(null)
  const [reference, setReference] = useState("")
  const [description, setDescription] = useState("")
  const [bin, setBin] = useState("")
  const [binSearch, setBinSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const bins = useApi<any[]>(staff && palletOpen && q.data?.rig.warehouse_id ? `/bins?warehouse_id=${q.data.rig.warehouse_id}` : null)
  const d = q.data
  useEffect(() => { if (d) { setBase(d.rig.base_area || "")
    setWarehouse(d.rig.warehouse_id || user?.warehouse_id || "QLD")
    setSupervisor(d.rig.supervisor_id || "") } }, [d, user?.warehouse_id])
  const mutate = async (path: string, method: string, body: any, message: string) => {
    if (busy) return
    setBusy(true)
    try {
      await api(path, { method, body })
      setEdit(false)
      setPalletOpen(false)
      await qc.invalidateQueries()
      toast(message)
    } catch (error) { toast(error instanceof Error ? error.message : "Could not save", "error") }
    finally { setBusy(false) }
  }
  const openPallet = (existing: any = null) => {
    setPallet(existing)
    setReference(existing?.reference || "")
    setDescription(existing?.description || "")
    setBin(existing?.bin_id || "")
    setBinSearch("")
    setPalletOpen(true)
  }
  const empty = (text: string) => <Body>{text}</Body>
  return <View style={{ flex: 1, backgroundColor: colors.surface }}>
    <Header title={d?.rig.number || "Rig account"} subtitle={d?.rig.warehouse_id || "Configure warehouse assignment"} />
    {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={q.error.message} onRetry={q.refetch} /> : d && <>
      <ChipRow testIDPrefix="rig-account-tab" value={tab} onChange={setTab} options={[{ value: "overview", label: "Overview" }, { value: "pallet", label: "Pallets" }, { value: "trip", label: "Trips" }, { value: "loan", label: "Equipment" }, { value: "request", label: "Requests" }, { value: "history", label: "History" }]} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl, width: "100%", maxWidth: 1160, alignSelf: "center" }}>
        {tab === "overview" && <>
          <Card style={{ gap: spacing.md }}><H3>Rig details</H3><Label>Base area</Label><Body>{d.rig.base_area || "Not recorded"}</Body><Label>Senior drilling manager</Label><Body>{d.supervisor?.name || "Not assigned"}</Body>
            {staff && <Button title="Manage rig details" variant="secondary" onPress={() => setEdit(true)} />}
          </Card>
          <Row style={{ flexWrap: "wrap" }}>
            <Card style={{ flex: 1, minWidth: 140 }}><H3>{d.pallets.filter((p: any) => p.status === "stored").length} pallets</H3><Body>Stored in Operations</Body></Card>
            <Card style={{ flex: 1, minWidth: 140 }}><H3>{d.upcoming.length} trips</H3><Body>Current & upcoming</Body></Card>
            <Card style={{ flex: 1, minWidth: 140 }}><H3>{d.loans.filter((l: any) => l.status === "out").length} loans</H3><Body>Equipment signed out</Body></Card>
          </Row>
          <Card style={{ gap: spacing.sm }}><H3>Crew</H3>{d.crew.length ? d.crew.map((member: any) => <View key={member.id}><Body>{member.name}</Body><Label>{roleLabel(member.role)}</Label></View>) : empty("No crew assigned. An administrator can assign users to this rig.")}</Card>
          <Body>Activity below shows up to 100 recent records per category. Pallet records describe physical allocations and do not change inventory quantities.</Body>
        </>}
        {tab === "pallet" && <>
          <H3>Operations rack pallets</H3><Body>Only active SEC1 rack locations in this rig's warehouse can be assigned.</Body>
          {staff && <Button title="Allocate pallet" icon="archive-outline" disabled={!d.rig.warehouse_id} onPress={() => openPallet()} />}
          {!d.pallets.length && <EmptyState title="No pallet allocations" text="Warehouse staff can record a labelled pallet and its Operations bin." />}
          {d.pallets.map((p: any) => <Card key={p.id} style={{ gap: spacing.sm }}><Mono>{p.reference}</Mono><StatusPill status={p.status === "stored" ? "available" : "returned"} label={p.status} /><Body>{p.description || "No contents description"}</Body><Label>{p.bin_code} · {fmtDate(p.updated_at)}</Label>
            <Button title="View rack location" variant="ghost" onPress={() => router.push({ pathname: PATH.WAREHOUSE_MAP, params: { wh: d.rig.warehouse_id, bin_id: p.bin_id } })} />
            {staff && <Row style={{ flexWrap: "wrap" }}><Button title={p.status === "stored" ? "Move pallet" : "Store again"} variant="secondary" disabled={busy} onPress={() => openPallet(p)} />{p.status === "stored" && <Button title="Release pallet" variant="ghost" disabled={busy} onPress={() => mutate(`/rig-accounts/${id}/pallet/${p.id}`, "PATCH", { status: "released" }, "Pallet released")} />}</Row>}
          </Card>)}
        </>}
        {tab === "trip" && <>
          <H3>Current & upcoming trips</H3>{!d.upcoming.length && empty("No current or upcoming trips.")}
          {d.upcoming.map((t: any) => <Card key={t.id} style={{ gap: spacing.sm }}><Mono>{t.number}</Mono><Body>{t.site || "Site not recorded"}</Body><Label>{t.start_date} – {t.end_date}</Label><StatusPill status={t.status} />{(staff || t.driller_id === user?.id) && <Button title="View trip" variant="ghost" onPress={() => router.push({ pathname: PATH.TRIP_DETAIL, params: { id: t.id } })} />}</Card>)}
          <H3>Recent trip history</H3>{d.trips.filter((t: any) => !d.upcoming.some((u: any) => u.id === t.id)).map((t: any) => <Card key={t.id}><Mono>{t.number}</Mono><Body>{t.site}</Body><Label>{t.start_date} – {t.end_date}</Label><StatusPill status={t.status} /></Card>)}
        </>}
        {tab === "loan" && <><H3>Equipment loan history</H3>{!d.loans.length && empty("No recorded equipment loans for this rig.")}{d.loans.map((l: any) => <Card key={l.id} style={{ gap: spacing.sm }}><Mono>{l.equipment_code}</Mono><Body>{l.equipment_name} · {l.driller_name}</Body><StatusPill status={l.status === "out" && l.due_at < new Date().toISOString() ? "overdue" : l.status} /><Label>Collected {fmtDate(l.checkout_at)} · Due {fmtDate(l.due_at)}</Label>{l.return_at && <Label>Returned {fmtDate(l.return_at)}</Label>}<Button title="View equipment" variant="ghost" onPress={() => router.push({ pathname: PATH.EQUIPMENT_DETAIL, params: { id: l.equipment_id } })} /></Card>)}</>}
        {tab === "request" && <><H3>Stock requests</H3>{!d.requests.length && empty("No recorded requests for this rig.")}{d.requests.map((r: any) => <Card key={r.id} style={{ gap: spacing.sm }}><Mono>{r.number}</Mono><Body>{r.type} · {fmtDate(r.created_at)}</Body><StatusPill status={r.status} />{(staff || r.submitted_by_id === user?.id) && <Button title="View request" variant="ghost" onPress={() => router.push({ pathname: PATH.REQUEST_DETAIL, params: { id: r.id } })} />}</Card>)}</>}
        {tab === "history" && <>
          <H3>Stock movements</H3>{!d.movements.length && empty("No stock movements recorded for this rig.")}{d.movements.map((m: any) => <Card key={m.id}><Mono>{m.sku}</Mono><Body>{m.delta > 0 ? "+" : ""}{m.delta} · {m.bin_code}</Body><Label>{m.type} · {fmtDate(m.at)}</Label></Card>)}
          <H3>Rig account activity</H3>{!d.history.length && empty("No rig account changes recorded yet.")}{d.history.map((h: any) => <Card key={h.id}><Body>{h.action.replaceAll("rig.", "").replaceAll("_", " ")}</Body><Label>{h.user_name} · {fmtDate(h.at)}</Label></Card>)}
        </>}
      </ScrollView>
    </>}
    <Sheet visible={edit} onClose={() => { if (!busy) setEdit(false) }}>
      <H3>Manage rig</H3><Label>Warehouse</Label>
      <ChipRow testIDPrefix="rig-warehouse" value={warehouse} onChange={value => { setWarehouse(value); setSupervisor("") }} options={(isRegionalManager(user) ? [user?.warehouse_id || "QLD"] : ["QLD", "NSW"]).map(value => ({ value, label: value }))} />
      <Body>Existing configured rigs cannot be transferred between warehouses here.</Body>
      <Field label="Base area" value={base} onChangeText={setBase} maxLength={200} />
      <Label>Senior drilling manager</Label>
      {supervisors.isError ? <ErrorState message={supervisors.error.message} onRetry={supervisors.refetch} /> : <ChipRow testIDPrefix="rig-supervisor" value={supervisor} onChange={setSupervisor} options={[{ value: "", label: "Unassigned" }, ...(supervisors.data || []).filter(s => s.warehouse_id === warehouse).map(s => ({ value: s.id, label: s.name }))]} />}
      <Button title="Save rig details" loading={busy} onPress={() => mutate(`/rig-accounts/${id}`, "PATCH", { warehouse_id: warehouse, base_area: base.trim(), supervisor_id: supervisor || null }, "Rig updated")} />
    </Sheet>
    <Sheet visible={palletOpen} onClose={() => { if (!busy) setPalletOpen(false) }}>
      <H3>{pallet ? "Store or move pallet" : "Allocate pallet"}</H3>
      {!pallet && <><Field label="Pallet reference" value={reference} onChangeText={setReference} maxLength={80} autoCapitalize="characters" /><Field label="Contents / description" value={description} onChangeText={setDescription} multiline maxLength={1000} /></>}
      <Label>Selected bin: {bins.data?.find(b => b.id === bin)?.code || "Choose a bin"}</Label>
      <Field label="Find Operations bin" value={binSearch} onChangeText={setBinSearch} placeholder="SEC1-L1-B1" />
      {bins.isLoading ? <Loading /> : bins.isError ? <ErrorState message={bins.error.message} onRetry={bins.refetch} /> : (bins.data || []).filter(b => b.code.startsWith("SEC1-") && b.code.toLowerCase().includes(binSearch.toLowerCase())).slice(0, 12).map(b => <Button key={b.id} title={b.code} variant={bin === b.id ? "primary" : "secondary"} onPress={() => setBin(b.id)} />)}
      <Button title="Save pallet allocation" loading={busy} disabled={!bin || (!pallet && !reference.trim())} onPress={() => pallet ? mutate(`/rig-accounts/${id}/pallet/${pallet.id}`, "PATCH", { status: "stored", bin_id: bin }, "Pallet location updated") : mutate(`/rig-accounts/${id}/pallet`, "POST", { reference: reference.trim(), description, bin_id: bin }, "Pallet allocated")} />
    </Sheet>
  </View>
}
