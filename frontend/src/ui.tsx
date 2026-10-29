import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps,
  TextStyle, View, ViewStyle,
} from "react-native";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, makeStyles, radius, spacing, ThemeColors, useTheme } from "@/src/theme";

export const Icon = MaterialDesignIcons;
export type IconName = React.ComponentProps<typeof MaterialDesignIcons>["name"];

const useStyles = makeStyles((c) => ({
  h1: { fontFamily: fonts.display, fontSize: 32, color: c.onSurface, letterSpacing: 0.5, textTransform: "uppercase" },
  h2: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface, letterSpacing: 0.5, textTransform: "uppercase" },
  h3: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.onSurface, letterSpacing: 0.3 },
  body: { fontFamily: fonts.text, fontSize: 15, color: c.onSurfaceSecondary },
  label: { fontFamily: fonts.text, fontSize: 12, color: c.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "700" },
  mono: { fontFamily: fonts.displaySemi, fontSize: 18, color: c.brandPrimary, letterSpacing: 1 },
  btn: { minHeight: 56, borderRadius: radius.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  btnLg: { minHeight: 72 },
  btnText: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 1, textTransform: "uppercase" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 26, borderRadius: radius.sm, alignSelf: "flex-start" },
  pillText: { fontFamily: fonts.text, fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  chip: { height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700" },
  input: { minHeight: 56, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, paddingHorizontal: spacing.lg, color: c.onSurface, fontFamily: fonts.text, fontSize: 17 },
  header: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, borderRadius: radius.md, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  toastText: { flex: 1, fontFamily: fonts.text, fontSize: 15, fontWeight: "700" },
  sheetBg: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.lg, borderTopWidth: 2, borderColor: c.brandPrimary },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.borderStrong },
  stepVal: { minWidth: 64, height: 52, textAlign: "center", fontFamily: fonts.display, fontSize: 28, color: c.onSurface, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
}));

type TP = { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; testID?: string };
export const H1 = (p: TP) => <Text {...p} style={[useStyles().h1, p.style]} />;
export const H2 = (p: TP) => <Text {...p} style={[useStyles().h2, p.style]} />;
export const H3 = (p: TP) => <Text {...p} style={[useStyles().h3, p.style]} />;
export const Body = (p: TP) => <Text {...p} style={[useStyles().body, p.style]} />;
export const Label = (p: TP) => <Text {...p} style={[useStyles().label, p.style]} />;
export const Mono = (p: TP) => <Text {...p} style={[useStyles().mono, p.style]} />;

type Variant = "primary" | "secondary" | "success" | "danger" | "ghost";
function variantColors(c: ThemeColors, v: Variant) {
  switch (v) {
    case "success": return { bg: c.success, fg: c.onSuccess, bd: c.success };
    case "danger": return { bg: c.error, fg: c.onError, bd: c.error };
    case "secondary": return { bg: c.surfaceTertiary, fg: c.onSurface, bd: c.borderStrong };
    case "ghost": return { bg: "transparent", fg: c.brandPrimary, bd: c.brandPrimary };
    default: return { bg: c.brandPrimary, fg: c.onBrandPrimary, bd: c.brandPrimary };
  }
}

export function Button({ title, onPress, variant = "primary", icon, loading, disabled, large, style, testID }: {
  title: string; onPress: () => void; variant?: Variant; icon?: IconName; loading?: boolean; disabled?: boolean;
  large?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const v = variantColors(colors, variant);
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      disabled={off}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress(); }}
      style={({ pressed }) => [s.btn, large && s.btnLg, { backgroundColor: v.bg, borderWidth: 2, borderColor: v.bd, opacity: off ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Icon name={icon} size={large ? 28 : 22} color={v.fg} /> : null}
      <Text style={[s.btnText, { color: v.fg }, large && { fontSize: 24 }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, testID, badge }: { icon: IconName; onPress: () => void; testID?: string; badge?: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={6} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={24} color={colors.onSurface} />
      {!!badge && (
        <View style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
          <Text style={{ color: colors.onError, fontSize: 11, fontWeight: "800" }}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  const s = useStyles();
  if (!onPress) return <View testID={testID} style={[s.card, style]}>{children}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.75, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

const STATUS: Record<string, { key: keyof ThemeColors; on: keyof ThemeColors; icon: IconName; label?: string }> = {
  pending: { key: "warning", on: "onWarning", icon: "clock-outline" },
  processing: { key: "info", on: "onInfo", icon: "sync" },
  approved: { key: "success", on: "onSuccess", icon: "check-bold" },
  rejected: { key: "error", on: "onError", icon: "close-thick" },
  cancelled: { key: "surfaceTertiary", on: "onSurfaceTertiary", icon: "cancel" },
  available: { key: "success", on: "onSuccess", icon: "check-circle" },
  checked_out: { key: "warning", on: "onWarning", icon: "account-arrow-right", label: "Signed out" },
  out: { key: "warning", on: "onWarning", icon: "account-arrow-right", label: "Out" },
  returned: { key: "success", on: "onSuccess", icon: "keyboard-return" },
  overdue: { key: "error", on: "onError", icon: "alert-octagon" },
  maintenance: { key: "error", on: "onError", icon: "wrench" },
  open: { key: "info", on: "onInfo", icon: "clipboard-edit-outline" },
  completed: { key: "success", on: "onSuccess", icon: "check-all" },
  prepared: { key: "info", on: "onInfo", icon: "package-variant-closed-check", label: "Packed" },
  issued: { key: "surfaceTertiary", on: "onSurfaceTertiary", icon: "truck-check" },
  take: { key: "brandPrimary", on: "onBrandPrimary", icon: "arrow-up-bold" },
  return: { key: "info", on: "onInfo", icon: "arrow-down-bold" },
  good: { key: "success", on: "onSuccess", icon: "thumb-up" },
  fair: { key: "warning", on: "onWarning", icon: "alert" },
  damaged: { key: "error", on: "onError", icon: "hammer-wrench" },
  low: { key: "error", on: "onError", icon: "arrow-down-bold-box" },
  mock: { key: "brandTertiary", on: "onBrandTertiary", icon: "test-tube", label: "Mock mode" },
  live: { key: "success", on: "onSuccess", icon: "cloud-check", label: "Live" },
};

export function StatusPill({ status, label, testID }: { status: string; label?: string; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const m = STATUS[status] || STATUS.cancelled;
  return (
    <View testID={testID} style={[s.pill, { backgroundColor: colors[m.key] }]}>
      <Icon name={m.icon} size={13} color={colors[m.on]} />
      <Text style={[s.pillText, { color: colors[m.on] }]}>{label || m.label || status.replace("_", " ")}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress}
      style={[s.chip, { backgroundColor: selected ? colors.brandPrimary : colors.surfaceSecondary, borderColor: selected ? colors.brandPrimary : colors.borderStrong }]}>
      <Text style={[s.chipText, { color: selected ? colors.onBrandPrimary : colors.onSurfaceSecondary }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow<T extends string>({ options, value, onChange, testIDPrefix }: {
  options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; testIDPrefix: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 56 }}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} testID={`${testIDPrefix}-${o.value}`} />
      ))}
    </ScrollView>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: spacing.sm }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
        style={[s.input, focus && { borderColor: colors.brandPrimary }, props.multiline && { minHeight: 96, paddingTop: 14, textAlignVertical: "top" }, style]}
      />
    </View>
  );
}

export function Stepper({ value, onChange, min = 1, max = 9999, testID }: { value: number; onChange: (n: number) => void; min?: number; max?: number; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.stepper}>
      <Pressable testID={`${testID}-minus`} style={s.stepBtn} onPress={() => onChange(Math.max(min, value - 1))}>
        <Icon name="minus" size={26} color={colors.onSurface} />
      </Pressable>
      <TextInput testID={`${testID}-input`} style={s.stepVal} keyboardType="number-pad" value={String(value)}
        onChangeText={(t) => { const n = parseInt(t.replace(/\D/g, ""), 10); onChange(isNaN(n) ? min : Math.min(max, Math.max(min, n))); }} />
      <Pressable testID={`${testID}-plus`} style={s.stepBtn} onPress={() => onChange(Math.min(max, value + 1))}>
        <Icon name="plus" size={26} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

export function Header({ title, subtitle, back = true, right }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
      {back && <IconButton testID="header-back-button" icon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}
      <View style={{ flex: 1 }}>
        <H2 numberOfLines={1}>{title}</H2>
        {subtitle ? <Label numberOfLines={1}>{subtitle}</Label> : null}
      </View>
      {right}
    </View>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.center} testID="loading-state">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      <Label>{text}</Label>
    </View>
  );
}

export function EmptyState({ icon = "check-decagram", title, text, testID = "empty-state" }: { icon?: IconName; title: string; text?: string; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.center, { paddingVertical: spacing.xxxl }]} testID={testID}>
      <Icon name={icon} size={56} color={colors.brandPrimary} />
      <H3 style={{ textAlign: "center" }}>{title}</H3>
      {text ? <Body style={{ textAlign: "center", color: colors.muted }}>{text}</Body> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.center} testID="error-state">
      <Icon name="alert-octagon" size={56} color={colors.error} />
      <Body style={{ textAlign: "center" }}>{message}</Body>
      <Button testID="retry-button" title="Retry" icon="refresh" onPress={onRetry} />
    </View>
  );
}

export function Sheet({ visible, onClose, children, testID }: { visible: boolean; onClose: () => void; children: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetBg} onPress={onClose}>
        <Pressable testID={testID} style={[s.sheet, { paddingBottom: insets.bottom + spacing.xl }]} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------- toast
type ToastKind = "success" | "error" | "info";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, kind: ToastKind = "success") => {
    setT({ msg, kind });
    Haptics.notificationAsync(kind === "error" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setT(null)), 3200);
  }, [anim]);
  const bg = t?.kind === "error" ? colors.error : t?.kind === "info" ? colors.info : colors.success;
  const fg = t?.kind === "error" ? colors.onError : t?.kind === "info" ? colors.onInfo : colors.onSuccess;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <Animated.View testID="toast" pointerEvents="none"
          style={[s.toast, { top: insets.top + spacing.sm, backgroundColor: bg, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }] }]}>
          <Icon name={t.kind === "error" ? "alert-octagon" : "check-circle"} size={24} color={fg} />
          <Text testID="toast-message" style={[s.toastText, { color: fg }]}>{t.msg}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

export function Row({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View testID={testID} style={[{ flexDirection: "row", alignItems: "center", gap: spacing.md }, style]}>{children}</View>;
}

export const WAREHOUSES = [
  { label: "QLD", value: "QLD" },
  { label: "NSW", value: "NSW" },
];
