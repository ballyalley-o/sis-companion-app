import { PATH } from 'route/path'
import { Pressable, RefreshControl, ScrollView, View } from "react-native"
import { useRouter } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { api } from "lib/api"
import { fmtDate, useApi } from "lib/hooks"
import { Body, Card, EmptyState, ErrorState, Header, Icon, IconButton, IconName, Label, Loading, Row } from "component/ui"
import { makeStyles, spacing, useTheme } from "design/theme"

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }))
const KIND: Record<string, { icon: IconName; color: "success" | "error" | "warning" | "info" | "brandPrimary" }> = {
  success: { icon: "check-circle", color: "success" },
  error: { icon: "close-octagon", color: "error" },
  warning: { icon: "alert", color: "warning" },
  request: { icon: "clipboard-text-clock", color: "brandPrimary" },
  info: { icon: "information", color: "info" },
}

export default function Notifications() {
  const s = useStyles()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const qc = useQueryClient()
  const q = useApi<any[]>("/notifications")

  const readAll = async () => {
    await api("/notifications/read-all", { method: "POST" }).catch(() => {})
    qc.invalidateQueries()
  }
  const open = (n: any) => {
    if (n.ref?.type === "request") router.push({ pathname: PATH.REQUEST_DETAIL, params: { id: n.ref.id } })
    else if (n.ref?.type === "equipment") router.push({ pathname: PATH.EQUIPMENT_DETAIL, params: { id: n.ref.id } })
    else if (n.ref?.type === "count") router.push({ pathname: PATH.COUNTS_DETAIL, params: { id: n.ref.id } })
    else if (n.ref?.type === "product") router.push({ pathname: PATH.PRODUCT_DETAIL, params: { id: n.ref.id } })
    else if (n.ref?.type === "trip") router.push({ pathname: PATH.TRIPS_DETAIL, params: { id: n.ref.id } })
    else if (n.ref?.type === "reorder") router.push(PATH.REORDERS)
  }

  return (
    <View style={s.root} testID="notifications-screen">
      <Header title="Notifications" right={<IconButton testID="notifications-read-all" icon="check-all" onPress={readAll} />} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={(q.error as Error).message} onRetry={q.refetch} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={q.refetch} />}>
          {(q.data || []).length === 0 && <EmptyState icon="bell-check" title="All caught up" />}
          {(q.data || []).map((n) => {
            const k = KIND[n.kind] || KIND.info
            return (
              <Pressable key={n.id} onPress={() => open(n)} testID={`notification-${n.id}`}>
                <Card style={!n.read ? { borderLeftWidth: 4, borderLeftColor: colors[k.color] } : undefined}>
                  <Row style={{ alignItems: "flex-start" }}>
                    <Icon name={k.icon} size={28} color={colors[k.color]} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Body style={{ color: colors.onSurface, fontWeight: n.read ? "500" : "800" }}>{n.title}</Body>
                      <Body style={{ fontSize: 13 }}>{n.body}</Body>
                      <Label>{fmtDate(n.at)}</Label>
                    </View>
                  </Row>
                </Card>
              </Pressable>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}
