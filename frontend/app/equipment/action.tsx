import { useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, uploadPhoto } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useApi } from "@/src/hooks";
import { Body, Button, ChipRow, Field, H3, Header, Icon, Label, Loading, Row, Sheet, useToast } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const CONDITIONS = [
  { value: "good", label: "Good", icon: "thumb-up" as const },
  { value: "fair", label: "Fair", icon: "alert" as const },
  { value: "damaged", label: "Damaged", icon: "hammer-wrench" as const },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  cond: { flex: 1, minHeight: 72, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center", gap: 4 },
  photo: { width: 88, height: 88, borderRadius: radius.sm },
  addPhoto: { width: 88, height: 88, borderRadius: radius.sm, borderWidth: 2, borderStyle: "dashed", borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  footer: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
}));

export default function EquipmentAction() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { id, mode } = useLocalSearchParams<{ id: string; mode: "checkout" | "return" }>();
  const eq = useApi<any>(`/equipment/${id}`);
  const drillers = useApi<any[]>("/drillers");
  const rigs = useApi<any[]>("/rigs");
  const [driller, setDriller] = useState(user?.role === "driller" ? user.name : "");
  const [rig, setRig] = useState("");
  const [cond, setCond] = useState("good");
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState("7");
  const [photos, setPhotos] = useState<{ uri: string; path?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [permSheet, setPermSheet] = useState<null | "ask" | "settings">(null);
  const checkout = mode === "checkout";

  const drillerOpts = useMemo(() => {
    const names = (drillers.data || []).map((d) => d.name);
    if (user && !names.includes(user.name)) names.unshift(user.name);
    return names.map((n) => ({ label: n, value: n }));
  }, [drillers.data, user]);

  const addFrom = async (src: "camera" | "library") => {
    setPermSheet(null);
    try {
      if (src === "camera") {
        const cur = await ImagePicker.getCameraPermissionsAsync();
        if (!cur.granted) {
          if (!cur.canAskAgain) return setPermSheet("settings");
          const req = await ImagePicker.requestCameraPermissionsAsync();
          if (!req.granted) return setPermSheet(req.canAskAgain ? null : "settings");
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.5, allowsEditing: false };
      const r = src === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!r.canceled && r.assets[0]) setPhotos((p) => [...p, { uri: r.assets[0].uri }].slice(0, 4));
    } catch (e: any) {
      toast(e.message || "Could not open camera", "error");
    }
  };

  const submit = async () => {
    if (checkout && (!driller || !rig)) return toast("Select driller name and rig number", "error");
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const ph of photos) paths.push(ph.path || (await uploadPhoto(ph.uri)));
      const body = checkout
        ? { driller_name: driller, rig_number: rig, condition: cond, notes, photos: paths, due_days: Math.max(1, Math.min(90, parseInt(days, 10) || 7)) }
        : { condition: cond, notes, photos: paths };
      await api(`/equipment/${id}/${checkout ? "checkout" : "return"}`, { method: "POST", body });
      qc.invalidateQueries();
      toast(checkout ? "Equipment signed out" : "Equipment signed back in");
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (eq.isLoading) return <View style={s.root}><Header title="Equipment" /><Loading /></View>;
  const e = eq.data;

  return (
    <View style={s.root} testID="equipment-action-screen">
      <Header title={checkout ? "Sign out" : "Sign in"} subtitle={e ? `${e.code} · ${e.name}` : undefined} />
      <KeyboardAwareScrollView bottomOffset={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl }}>
        {checkout ? (
          <>
            <View style={{ gap: spacing.sm }}>
              <Label>Driller name</Label>
              <View style={{ marginHorizontal: -spacing.lg }}><ChipRow testIDPrefix="equip-driller" value={driller} onChange={setDriller} options={drillerOpts} /></View>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Label>Rig number</Label>
              <View style={{ marginHorizontal: -spacing.lg }}><ChipRow testIDPrefix="equip-rig" value={rig} onChange={setRig} options={(rigs.data || []).map((r) => ({ label: r.number, value: r.number }))} /></View>
            </View>
            <Field testID="equip-due-days-input" label="Expected return (days)" value={days} onChangeText={setDays} keyboardType="number-pad" />
          </>
        ) : e?.current_loan ? (
          <View style={{ gap: 4 }}>
            <Label>Signed out to</Label>
            <H3>{e.current_loan.driller_name} · {e.current_loan.rig_number}</H3>
            <Body>Condition at checkout: {e.current_loan.checkout_condition}</Body>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Label>Condition {checkout ? "at checkout" : "on return"}</Label>
          <Row>
            {CONDITIONS.map((c) => {
              const on = cond === c.value;
              const tone = c.value === "good" ? colors.success : c.value === "fair" ? colors.warning : colors.error;
              return (
                <Pressable key={c.value} testID={`equip-condition-${c.value}`} onPress={() => setCond(c.value)}
                  style={[s.cond, { borderColor: on ? tone : colors.border, backgroundColor: on ? tone : colors.surfaceSecondary }]}>
                  <Icon name={c.icon} size={26} color={on ? colors.onSuccess : colors.onSurface} />
                  <Body style={{ fontWeight: "800", color: on ? colors.onSuccess : colors.onSurface }}>{c.label}</Body>
                </Pressable>
              );
            })}
          </Row>
        </View>

        <Field testID="equip-notes-input" label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Hours, accessories, damage details…" />

        <View style={{ gap: spacing.sm }}>
          <Label>Photos (optional, up to 4)</Label>
          <Row style={{ flexWrap: "wrap", gap: spacing.sm }}>
            {photos.map((p, i) => (
              <Pressable key={p.uri} testID={`equip-photo-${i}`} onPress={() => setPhotos(photos.filter((_, j) => j !== i))}>
                <Image source={{ uri: p.uri }} style={s.photo} contentFit="cover" />
              </Pressable>
            ))}
            {photos.length < 4 && (
              <Pressable testID="equip-add-photo" style={s.addPhoto} onPress={() => setPermSheet("ask")}>
                <Icon name="camera-plus" size={30} color={colors.brandPrimary} />
              </Pressable>
            )}
          </Row>
          {photos.length > 0 && <Label>Tap a photo to remove it</Label>}
        </View>
      </KeyboardAwareScrollView>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="equip-submit-button" large title={checkout ? "Confirm sign out" : "Confirm return"} icon="check-bold" variant={checkout ? "primary" : "success"} loading={busy} onPress={submit} />
        </View>
      </KeyboardStickyView>

      <Sheet visible={permSheet !== null} onClose={() => setPermSheet(null)} testID="photo-source-sheet">
        {permSheet === "settings" ? (
          <>
            <H3>Camera access is off</H3>
            <Body>Enable camera in Settings to photograph equipment condition. You can still choose from your library.</Body>
            <Button testID="photo-open-settings" title="Open settings" icon="cog" onPress={() => { setPermSheet(null); Linking.openSettings(); }} />
            <Button testID="photo-library-fallback" title="Choose from library" variant="secondary" icon="image" onPress={() => addFrom("library")} />
          </>
        ) : (
          <>
            <H3>Add condition photo</H3>
            <Body>Photos protect you and the crew if equipment comes back damaged.</Body>
            <Button testID="photo-take" title="Take photo" icon="camera" onPress={() => addFrom("camera")} />
            <Button testID="photo-library" title="Choose from library" variant="secondary" icon="image" onPress={() => addFrom("library")} />
          </>
        )}
      </Sheet>
    </View>
  );
}
