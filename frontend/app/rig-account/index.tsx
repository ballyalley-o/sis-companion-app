import { View, FlatList } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useApi } from "lib/hook"
import { PATH } from "route/path"
import { Body, Card, EmptyState, ErrorState, H3, Header, Label, Loading } from "component/ui"
import { spacing, useTheme } from "design/theme"

export default function RigAccountList() {
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const q = useApi<any[]>("/rig-accounts")
  return <View style={{ flex: 1, backgroundColor: colors.surface }}>
    <Header title="Rig accounts" subtitle="Crew, Operations pallets & activity" />
    {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={q.error.message} onRetry={q.refetch} /> : <FlatList data={q.data} keyExtractor={r => r.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
      ListEmptyComponent={<EmptyState title="No rig assigned" text="An administrator needs to configure your rig and warehouse assignment." />}
      renderItem={({ item }) => <Card onPress={() => router.push({ pathname: PATH.RIG_DETAIL, params: { id: item.id } })} style={{ gap: spacing.sm }}>
        <H3>{item.number}</H3><Label>{item.warehouse_id || "Warehouse not configured"}</Label><Body>{item.base_area || "Base area not recorded"}</Body>
      </Card>} />}
  </View>
}
