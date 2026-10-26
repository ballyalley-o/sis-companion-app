import { useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { Body, Button, Field, H2, Header, Icon, Label, Loading, useToast } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  camWrap: { height: 340, margin: spacing.lg, borderRadius: radius.lg, overflow: "hidden", borderWidth: 3, borderColor: c.brandPrimary, backgroundColor: c.surfaceSecondary },
  frame: { position: "absolute", top: "18%", left: "18%", right: "18%", bottom: "18%", borderWidth: 3, borderColor: c.brandPrimary, borderRadius: radius.md },
  panel: { margin: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, gap: spacing.md, alignItems: "center", borderWidth: 1, borderColor: c.border },
  bottom: { paddingHorizontal: spacing.lg, gap: spacing.md },
}));

export default function Scan() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [perm, requestPerm] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const lock = useRef(false);

  const resolve = async (payload: string) => {
    if (lock.current || !payload.trim()) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await api<{ type: string; id: string; code: string }>(`/scan/${encodeURIComponent(payload.trim())}`);
      setFlash("ok");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (r.type === "bin") router.push({ pathname: "/bin/[id]", params: { id: r.id, view: "1" } });
      else if (r.type === "equipment") router.push({ pathname: "/equipment/[id]", params: { id: r.id } });
      else router.push({ pathname: "/product/[id]", params: { id: r.id } });
    } catch (e: any) {
      setFlash("bad");
      toast(e.message, "error");
    } finally {
      setBusy(false);
      setTimeout(() => { lock.current = false; setFlash(null); }, 1500);
    }
  };

  const camera = () => {
    if (Platform.OS === "web") {
      return (
        <View style={s.panel} testID="scan-web-notice">
          <Icon name="cellphone" size={48} color={colors.brandPrimary} />
          <Body style={{ textAlign: "center" }}>Camera scanning runs on the phone app. Enter a bin, equipment ID or SKU below.</Body>
        </View>
      );
    }
    if (!perm) return <Loading text="Initializing camera…" />;
    if (!perm.granted) {
      return (
        <View style={s.panel} testID="scan-permission-panel">
          <Icon name="camera-outline" size={56} color={colors.brandPrimary} />
          <H2>Camera access</H2>
          <Body style={{ textAlign: "center" }}>Scan bin and equipment QR codes to pull up stock instantly — no typing with gloves on.</Body>
          {perm.canAskAgain ? (
            <Button testID="scan-allow-camera" title="Allow camera" icon="camera" onPress={requestPerm} style={{ alignSelf: "stretch" }} />
          ) : (
            <Button testID="scan-open-settings" title="Open settings" icon="cog" onPress={() => Linking.openSettings()} style={{ alignSelf: "stretch" }} />
          )}
          <Label>Or enter the code manually below</Label>
        </View>
      );
    }
    return (
      <View style={[s.camWrap, flash === "ok" && { borderColor: colors.success }, flash === "bad" && { borderColor: colors.error }]} testID="scan-camera">
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "ean13"] }}
          onBarcodeScanned={busy ? undefined : (r) => resolve(r.data)} />
        <View pointerEvents="none" style={s.frame} />
      </View>
    );
  };

  return (
    <View style={s.root} testID="scan-screen">
      <Header title="Scan" subtitle="Bin QR · Equipment ID · SKU" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        {camera()}
        <View style={s.bottom}>
          <Field testID="scan-manual-input" label="Manual entry" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="e.g. QLD-A01, EQ-1001, DB-HQ-001" onSubmitEditing={() => resolve(code)} returnKeyType="go" />
          <Button testID="scan-manual-submit" title="Look up" icon="magnify" large loading={busy} onPress={() => resolve(code)} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
