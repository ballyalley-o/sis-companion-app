import { useState } from "react"
import { ScrollView, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { api } from "lib/api"
import { isStaff, useAuth } from "state/auth"
import { fmtDate, useApi } from "lib/hook"
import { Body, Button, Card, ErrorState, Field, H3, Header, Label, Loading, Mono, Row, StatusPill, useToast } from "component/ui"
import { makeStyles, spacing, useTheme } from "design/theme"
import { useDecision } from "component/decision"

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }))

export default function RequestDetail() {
  const s = useStyles()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const qc = useQueryClient()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const q = useApi<any>(`/requests/${id}`)
  const d = useDecision()
  const r = q.data
  const [purchaseBusy, setPurchaseBusy] = useState(false)
  const [reference, setReference] = useState("")
  const purchase = async (link = false) => {
    if (purchaseBusy) return
    setPurchaseBusy(true)
    try {
      await api(`/requests/${id}/purchase${link ? "/link" : ""}`, { method: "POST", ...(link ? { body: { reference } } : {}) })
      await qc.invalidateQueries()
      toast(link ? "Zoho purchase order linked" : "Purchase draft prepared for warehouse review")
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update purchase", "error")
    } finally {
      setPurchaseBusy(false)
    }
  }

  const cancel = async () => {
    try {
      await api(`/requests/${id}/cancel`, { method: "POST" })
      toast("Request cancelled", "info")
      qc.invalidateQueries()
    } catch (e: any) {
      toast(e.message, "error")
    }
  }

  return (
    <View style={s.root} testID="request-detail-screen">
      <Header title={r?.number || "Request"} subtitle={r ? `${r.type} · ${r.warehouse_id}` : undefined} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : r && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ gap: spacing.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <StatusPill status={r.type} />
              <StatusPill status={r.status} testID="request-detail-status" />
            </Row>
            <H3>{r.driller_name}</H3>
            <Body>Rig {r.rig_number} · submitted by {r.submitted_by}</Body>
            <Label>{fmtDate(r.created_at)}</Label>
            {!!r.notes && <Body style={{ color: colors.onSurface }}>“{r.notes}”</Body>}
          </Card>
          <Card style={{ gap: spacing.md }}>
            <Label>Items</Label>
            {r.items.map((it: any) => (
              <Row key={it.product_id + it.bin_id} style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Mono>{it.sku}</Mono>
                  <Body>{it.name} · bin {it.bin_code}</Body>
                </View>
                <Body style={{ color: colors.onSurface, fontSize: 22, fontWeight: "800" }}>{r.type === "take" ? "−" : "+"}{it.qty}</Body>
              </Row>
            ))}
          </Card>
          {(r.shortage?.length > 0 || r.purchase) && (
            <Card style={{ gap: spacing.md }} testID="request-purchase-review">
              <H3>{r.purchase ? "Awaiting purchase" : "Stock shortage"}</H3>
              <Body>Warehouse totals are checked across all bins. Stock is not reserved until fulfilment.</Body>
              {(r.purchase?.items || r.shortage).map((item: any) => (
                <View key={item.product_id} style={{ gap: spacing.xs }}>
                  <Mono>{item.sku}</Mono>
                  <Body>{item.name}</Body>
                  <Body>Requested {item.requested_qty} · on hand at review {item.available_qty} · purchase {item.qty} {item.unit}</Body>
                </View>
              ))}
              {r.purchase && <>
                <Mono>{r.purchase.number}</Mono>
                <Body>This SIS purchase draft has not been sent to a supplier. Create and approve the PO in Zoho, then link its reference below.</Body>
                {r.purchase.zoho_number && <Body>Zoho PO: {r.purchase.zoho_number}</Body>}
                <Body>Receive the delivery into the requested bins, then approve the original request. No partial issue is recorded.</Body>
              </>}
              {isStaff(user) && r.status === "pending" && !r.purchase && <Button title="Request purchase" icon="cart-plus" loading={purchaseBusy} onPress={() => purchase()} />}
              {isStaff(user) && r.status === "awaiting_purchase" && !r.purchase?.zoho_id && <>
                <Field label="Zoho PO reference" value={reference} onChangeText={setReference} placeholder="PO number or reference" />
                <Button title="Link Zoho PO" loading={purchaseBusy} disabled={reference.trim().length < 2} onPress={() => purchase(true)} />
              </>}
            </Card>
          )}
          {r.zoho_txn_id && (
            <Card testID="request-zoho-txn">
              <Label>Zoho inventory adjustment</Label>
              <Mono>{r.zoho_txn_id}</Mono>
              <Label>{r.zoho_mode === "mock" ? "Simulated (mock mode)" : "Posted to Zoho"}</Label>
            </Card>
          )}
          <Card style={{ gap: spacing.sm }}>
            <Label>Audit trail</Label>
            {r.history.map((h: any, i: number) => (
              <Row key={i} style={{ alignItems: "flex-start" }}>
                <StatusPill status={h.status} />
                <View style={{ flex: 1 }}>
                  <Body style={{ color: colors.onSurface }}>{h.by}</Body>
                  <Label>{fmtDate(h.at)}</Label>
                  {!!h.note && <Body>{h.note}</Body>}
                </View>
              </Row>
            ))}
          </Card>
          {isStaff(user) && ["pending", "awaiting_purchase"].includes(r.status) && (
            <Row>
              <Button testID="request-detail-approve" title="Approve" variant="success" icon="check-bold" large style={{ flex: 1 }} loading={d.busy === r.id + "a"} onPress={() => d.approve(r)} />
              {r.status === "pending" && <Button testID="request-detail-reject" title="Reject" variant="danger" icon="close-thick" large style={{ flex: 1 }} onPress={() => d.startReject(r)} />}
            </Row>
          )}
          {r.status === "pending" && r.submitted_by_id === user?.id && (
            <Button testID="request-detail-cancel" title="Cancel request" variant="secondary" icon="cancel" onPress={cancel} />
          )}
        </ScrollView>
      )}
      {d.sheet}
    </View>
  )
}
