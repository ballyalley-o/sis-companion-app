import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { Body, Button, Card, ChipRow, ErrorState, Field, H3, Header, Icon, Label, Loading, Mono } from "@/src/ui";
import { useTheme } from "@/src/theme";
import { baysOnLevel, locateBin, mapSections, rackOffset } from "@/src/warehouseMap";

function Radar({ small = false }: { small?: boolean }) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined, disposed = false;
    const update = (reduce: boolean) => {
      loop?.stop(); progress.setValue(0);
      if (!reduce && !disposed) {
        loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1800, useNativeDriver: false })); loop.start();
      }
    };
    AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => {});
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
    return () => { disposed = true; loop?.stop(); listener.remove(); };
  }, [progress]);
  const size = small ? 30 : 54;
  return <View pointerEvents="none" testID="location-radar" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <Animated.View style={{ position: "absolute", width: size, height: size, borderRadius: size, borderWidth: 2, borderColor: colors.error, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }), transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }] }} />
    <View style={{ width: size * 0.65, height: size * 0.65, borderRadius: size, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error }} /></View>
  </View>;
}
const AISLES: Record<string, string> = { SEC1: "A01 · Main cross aisle", SEC2: "A03 · Rack access", SEC3: "A02 · Lower cross aisle", SEC4: "A02 · Lower cross aisle" };
type Pick = { kind: "product" | "equipment"; id: string };

function AreaChip({ area, color, compact = false }: { area: string; color: string; compact?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ flexShrink: 1, borderRadius: 99, borderWidth: 1, borderColor: color, backgroundColor: colors.surfaceTertiary, paddingHorizontal: compact ? 5 : 8, paddingVertical: 3 }}>
    <Text numberOfLines={1} style={{ color: colors.onSurfaceSecondary, fontSize: compact ? 9 : 10, fontWeight: "600" }}>{area}</Text>
  </View>;
}

export default function WarehouseMap() {
  const params = useLocalSearchParams<{ product_id?: string; equipment_id?: string; wh?: string; bin_id?: string }>();
  const { user, ready } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 1050;
  const [wh, setWh] = useState(params.wh || user?.warehouse_id || "QLD");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pick, setPick] = useState<Pick | null>(params.equipment_id ? { kind: "equipment", id: params.equipment_id } : params.product_id ? { kind: "product", id: params.product_id } : null);
  const [chosen, setChosen] = useState(params.bin_id);
  const [sectionCode, setSectionCode] = useState("SEC1");
  const rackScroll = useRef<ScrollView>(null);
  const pageScroll = useRef<ScrollView>(null);
  const rackPosition = useRef({ column: 0, rack: 0 });
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    setPick(params.equipment_id ? { kind: "equipment", id: params.equipment_id } : params.product_id ? { kind: "product", id: params.product_id } : null);
    setChosen(params.bin_id); setWh(params.wh || user?.warehouse_id || "QLD");
  }, [params.product_id, params.equipment_id, params.bin_id, params.wh, user?.warehouse_id]);
  const active = ready && !!user;
  const products = useApi<any[]>(active ? `/products?warehouse_id=${encodeURIComponent(wh)}&q=${encodeURIComponent(debounced)}` : null);
  const equipment = useApi<any[]>(active ? `/equipment?warehouse_id=${encodeURIComponent(wh)}` : null);
  const bins = useApi<any[]>(active ? `/bins?warehouse_id=${encodeURIComponent(wh)}` : null);
  const detail = useApi<any>(active && pick ? `/${pick.kind === "product" ? "products" : "equipment"}/${encodeURIComponent(pick.id)}` : null);
  const item = detail.data;
  const home = bins.data?.find(b => b.id === item?.home_bin_id);
  const locations: any[] = pick?.kind === "equipment" ? (item?.warehouse_id === wh && home ? [{ bin_id: home.id, bin_code: home.code, qty: 1 }] : []) : (item?.locations || []).filter((l: any) => l.warehouse_id === wh);
  const selected = locations.find(l => l.bin_id === chosen) || locations[0];
  const target = locateBin(selected?.bin_code);
  const section = target?.section || mapSections.find(s => s.code === sectionCode)!;
  const away = pick?.kind === "equipment" && item?.status !== "available";
  const phrase = debounced.toLowerCase();
  const results = [
    ...(products.data || []).map(p => ({ kind: "product" as const, item: p, code: p.sku })),
    ...(equipment.data || []).filter(e => `${e.code} ${e.name} ${e.category}`.toLowerCase().includes(phrase)).map(e => ({ kind: "equipment" as const, item: e, code: e.code })),
  ];
  if (!debounced) results.sort((a, b) => Number(!!b.item.map_demo) - Number(!!a.item.map_demo));
  const mapWidth = desktop ? Math.min(width - 440, 1100) : Math.max(width - 64, 300);
  const scale = mapWidth / 1060;
  const choose = (p: Pick) => { setPick(p); setChosen(undefined); };
  const scrollToTarget = () => { if (target) rackScroll.current?.scrollTo({ x: rackOffset(target.code, mapWidth - 32), animated: false }); };
  const focusRack = () => {
    scrollToTarget();
    pageScroll.current?.scrollTo({ y: Math.max(0, rackPosition.current.column + rackPosition.current.rack + 12), animated: true });
  };
  useEffect(scrollToTarget, [target?.code, mapWidth]);
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  return <View style={{ flex: 1, backgroundColor: colors.surface }} testID="warehouse-map-screen">
    <Header title="Warehouse locator" subtitle="Search it. Locate it. Pick it." />
    <ScrollView ref={pageScroll} testID="warehouse-locator-scroll" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: desktop ? "row" : "column", gap: 20, alignItems: "flex-start" }}>
        <View style={{ width: desktop ? 340 : "100%", gap: 14 }}>
          <ChipRow testIDPrefix="map-warehouse" options={(user.role === "manager" ? [user.warehouse_id || "QLD"] : ["QLD", "NSW"]).map(value => ({ label: value, value }))} value={wh} onChange={value => { setWh(value); setPick(null); setChosen(undefined); }} />
          <Field testID="map-search" label="Find stock or equipment" placeholder="Name, SKU or equipment code" value={search} onChangeText={setSearch} autoCapitalize="none" />
          <Label>{debounced ? "Search results" : "Try the map test items"}</Label>
          {(products.isLoading || equipment.isLoading) && <Loading />}
          {products.isError && <ErrorState message={(products.error as Error).message} onRetry={products.refetch} />}
          {equipment.isError && <ErrorState message={(equipment.error as Error).message} onRetry={equipment.refetch} />}
          <ScrollView style={{ maxHeight: desktop ? 620 : 260 }} nestedScrollEnabled><View style={{ gap: 8 }}>
            {results.slice(0, 40).map(result => {
              const eHome = bins.data?.find(b => b.id === result.item.home_bin_id);
              const location = result.kind === "product" ? result.item.locations?.map((l: any) => l.bin_code).filter(Boolean).join(" · ") : eHome?.code;
              const highlighted = pick?.id === result.item.id && pick?.kind === result.kind;
              return <Card key={`${result.kind}-${result.item.id}`} testID={`map-result-${result.code}`} onPress={() => choose({ kind: result.kind, id: result.item.id })} style={{ borderColor: highlighted ? colors.brandPrimary : colors.border, gap: 5 }}>
                <Label>{result.kind === "product" ? "Stock" : "Equipment"}{result.item.map_demo ? " · Test item" : ""}</Label>
                <Body style={{ color: colors.onSurface, fontWeight: "800" }}>{result.item.name}</Body><Mono>{result.code}</Mono>
                <Body style={{ fontSize: 12 }}>{location || "Storage location not assigned"}</Body>
                {result.kind === "equipment" && <Body style={{ fontSize: 12 }}>{result.item.status.replaceAll("_", " ")}{result.item.status !== "available" ? " · home storage only" : ""}</Body>}
              </Card>;
            })}
            {!products.isLoading && !equipment.isLoading && !results.length && <Body>No matching stock or equipment. Try another name or code.</Body>}
            {results.length > 40 && <Body>Showing 40 matches. Refine your search to find an item.</Body>}
          </View></ScrollView>
        </View>
        <View onLayout={event => { rackPosition.current.column = event.nativeEvent.layout.y; }} style={{ flex: desktop ? 1 : undefined, width: desktop ? undefined : "100%", gap: 16, minWidth: 0 }}>
          <Card style={{ gap: 10, borderColor: target ? colors.brandPrimary : colors.border }}>
            {detail.isLoading ? <Loading /> : detail.isError ? <ErrorState message={(detail.error as Error).message} onRetry={detail.refetch} /> : item ? <>
              <Label>{away ? "Home storage · equipment currently away" : "Item location"}{item.map_demo ? " · Test item" : ""}</Label><H3>{item.name}</H3>
              {locations.length > 1 && <ChipRow testIDPrefix="map-location" options={locations.map(l => ({ value: l.bin_id, label: `${l.bin_code} · ${l.qty}` }))} value={selected?.bin_id} onChange={setChosen} />}
              <Mono testID="map-location-code">{selected?.bin_code || "No storage bin assigned"}</Mono>
              {target ? <Body testID="map-location-description">{target.section.area} → {AISLES[target.section.code]} → {target.section.code} → Level {target.level} → Bay {target.bay}{pick?.kind === "product" ? ` · ${selected.qty} ${item.unit} on hand` : ""}</Body> : <Body>This location is not mapped. Existing stock locations have been preserved.</Body>}
              {target && <Button testID="map-focus-bin" title="Show exact bin" variant="primary" icon="radar" onPress={focusRack} />}
              {away && <Body>Equipment is {item.status.replaceAll("_", " ")}. The marker shows its assigned home bin, not its current physical position.</Body>}
              <Button title={pick?.kind === "equipment" ? "Equipment details" : "Product details"} variant="secondary" icon="information-outline" onPress={() => router.push({ pathname: pick?.kind === "equipment" ? "/equipment/[id]" : "/product/[id]", params: { id: item.id, wh } })} />
              {selected && <Button title="View bin contents" variant="ghost" icon="package-variant" onPress={() => router.push({ pathname: "/bin/[id]", params: { id: selected.bin_id, view: "1" } })} />}
            </> : <><H3>Where is it stored?</H3><Body>Choose a search result to light up its section and exact rack position. You can also explore the sections below.</Body></>}
            {bins.isError && <ErrorState message={(bins.error as Error).message} onRetry={bins.refetch} />}
          </Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="radar" size={22} color={colors.brandPrimary} /><Label>Floor overview</Label></View>
          <View testID="map-area-legend" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {mapSections.map(s => <View key={s.code} style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: s.color }} />
              <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}>{s.code}</Text>
              <AreaChip area={s.area} color={s.color} />
            </View>)}
          </View>
          {target && <Body style={{ fontSize: 12 }}>Tap the radar section to jump to {target.code} in the detailed rack view.</Body>}
          <View testID="warehouse-map-canvas" style={{ width: mapWidth, height: 735 * scale, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8 }}>
            {[{ x: 250, y: 245, text: "A01 / MAIN CROSS AISLE" }, { x: 260, y: 458, text: "A02 / LOWER CROSS AISLE" }, { x: 42, y: 510, text: "RECEIVING ↑" }, { x: 760, y: 370, text: "A03 / RACK ACCESS" }].map(label => <Text key={label.text} style={{ position: "absolute", left: label.x * scale, top: label.y * scale, fontSize: Math.max(8, 13 * scale), color: colors.muted }}>{label.text}</Text>)}
            <View style={{ position: "absolute", left: 45 * scale, top: 330 * scale, width: 370 * scale, height: 85 * scale, backgroundColor: colors.surfaceTertiary, justifyContent: "center", padding: 10 * scale }}><Text style={{ color: colors.onSurfaceSecondary, fontSize: Math.max(8, 14 * scale) }}>DISPATCH → STAGING</Text></View>
            {mapSections.map(s => {
              const selectedSection = section.code === s.code, hit = target?.section.code === s.code;
              return <Pressable key={s.code} testID={`map-section-${s.code}`} accessibilityRole="button" accessibilityLabel={hit ? `Show exact bin ${target?.code} in ${s.area}` : `Explore ${s.code}, ${s.area} area`} onPress={() => {
                if (hit) { focusRack(); return; }
                setPick(null); setChosen(undefined); setSectionCode(s.code);
              }} style={{ position: "absolute", left: s.x * scale, top: s.y * scale, width: s.width * scale, height: s.height * scale, borderWidth: selectedSection ? 2 : 1, borderColor: s.color, backgroundColor: selectedSection ? colors.surfaceTertiary : colors.surface, padding: 8 * scale, gap: 7 * scale }}>
                <View testID={`map-area-${s.code}`} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={{ color: s.color, fontWeight: "800", fontSize: Math.max(8, 16 * scale) }}>{s.code}</Text>
                  <AreaChip area={s.area} color={s.color} compact />
                </View>
                <View style={{ flex: 1, flexDirection: s.code === "SEC2" ? "column" : "row", gap: 3 * scale }}>
                  {Array.from({ length: s.bays }, (_, index) => {
                    const marked = hit && s.code !== "SEC4" && target?.bay === index + 1;
                    return <View key={index} testID={`map-bay-${s.code}-${index + 1}`} style={{ flex: 1, borderWidth: marked ? 2 : 1, borderColor: marked ? colors.error : colors.borderStrong, backgroundColor: marked ? colors.brandTertiary : colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
                      {marked && <View style={{ position: "absolute", zIndex: 2 }}><Radar small /></View>}<Text style={{ color: colors.onSurface, fontSize: Math.max(6, 10 * scale) }}>{index + 1}</Text>
                    </View>;
                  })}
                </View>
                {hit && s.code === "SEC4" && <View style={{ position: "absolute", top: s.height * scale / 2 - 15, left: s.width * scale / 2 - 15 }}><Radar small /></View>}
              </Pressable>;
            })}
          </View>
          <ChipRow testIDPrefix="map-rack-section" options={mapSections.map(s => ({ label: s.code, value: s.code }))} value={section.code} onChange={code => { setPick(null); setChosen(undefined); setSectionCode(code); }} />
          <View testID="warehouse-rack-destination" onLayout={event => { rackPosition.current.rack = event.nativeEvent.layout.y; }}><Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Label>{section.code}</Label><AreaChip area={section.area} color={section.color} />
              <Label style={{ fontSize: 10 }}>{AISLES[section.code]}</Label>
            </View><Body>Rack elevation · Level 1 is the bottom{target ? ` · Target: ${target.code}` : ""}</Body>
            <ScrollView horizontal ref={rackScroll} testID="warehouse-rack-view" onContentSizeChange={scrollToTarget}>
              <View style={{ width: Math.max(900, section.bays * 64 + 130), gap: 12, paddingVertical: 12 }}>
                {Array.from({ length: section.levels }, (_, index) => section.levels - index).map(level => <View key={level} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.onSurface, width: 65, fontWeight: "800" }}>LEVEL {level}</Text>
                  <View style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: 4 }}>
                    {Array.from({ length: baysOnLevel(section, level) }, (_, index) => {
                      const bay = index + 1, hit = target?.level === level && target?.bay === bay && target?.section.code === section.code;
                      const code = `${section.code}-L${level}-B${bay}`;
                      return <View key={code} testID={`rack-bin-${code}`} accessibilityLabel={`${code}${hit ? ", selected location" : ""}`} style={{ width: 60, minHeight: 96, borderWidth: hit ? 2 : 1, borderColor: hit ? colors.error : section.color, backgroundColor: hit ? colors.brandTertiary : colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderRadius: 4 }}>
                        {hit ? <Radar /> : <Icon name="package-variant-closed" size={20} color={colors.muted} />}<Text style={{ color: colors.onSurface, fontSize: 11, fontWeight: hit ? "800" : "500" }}>L{level} · B{bay}</Text>
                      </View>;
                    })}
                  </View><Text style={{ color: colors.muted, width: 50 }}>{baysOnLevel(section, level)} bins</Text>
                </View>)}
              </View>
            </ScrollView>
            {section.code === "SEC4" && <Body>Levels 1–2: 8 positions each. Levels 3–4: 14 each. Lower-row alignment is illustrative; the radar in this rack view identifies the exact bin code.</Body>}
          </Card></View>
          <Label>Reference plan · not to scale</Label><Body style={{ fontSize: 12 }}>Aisle labels follow your drawings. Confirm warehouse assignment and bay-number direction on site. Radar indicates a recorded storage location, not live indoor tracking. Map test items are sample records.</Body>
        </View>
      </View>
    </ScrollView>
  </View>;
}
