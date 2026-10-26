import { useEffect, useState } from "react";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { Body, Button, Field, H1, Icon, Label, Row, useToast } from "@/src/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1562237553-fd52cb2067b6?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200";

const DEMO = process.env.EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS === "true" ? [
  { label: "Driller", email: process.env.EXPO_PUBLIC_DEMO_DRILLER_EMAIL || "", pw: process.env.EXPO_PUBLIC_DEMO_DRILLER_PASSWORD || "" },
  { label: "QLD Mgr", email: process.env.EXPO_PUBLIC_DEMO_MANAGER_EMAIL || "", pw: process.env.EXPO_PUBLIC_DEMO_MANAGER_PASSWORD || "" },
  { label: "Admin", email: process.env.EXPO_PUBLIC_DEMO_ADMIN_EMAIL || "", pw: process.env.EXPO_PUBLIC_DEMO_ADMIN_PASSWORD || "" },
].filter((account) => account.email && account.pw) : [];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 300, justifyContent: "flex-end" },
  heroInner: { padding: spacing.xl, gap: spacing.sm },
  badge: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  form: { padding: spacing.xl, gap: spacing.lg },
  demo: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  stripe: { height: 6, backgroundColor: c.brandPrimary },
  desktopHero: { width: "52%", height: "auto", borderRightWidth: 1, borderRightColor: c.border },
  desktopHeroInner: { flex: 1, padding: 48, justifyContent: "space-between", gap: spacing.xxxl },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  desktopPanel: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl },
  desktopForm: { width: "100%", maxWidth: 420, padding: 0 },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.md },
}));

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 960;
  const { login, loginWithGoogle, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const destination = returnTo?.startsWith("/bin/") && !returnTo.startsWith("//") ? returnTo : "/(tabs)";
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (user) router.replace(destination as any);
  }, [destination, user, router]);

  useEffect(() => {
    if (Platform.OS !== "web" || !googleClientId) return;
    const container = document.getElementById("google-signin-button");
    if (!container) return;

    let timer: number | undefined;
    let attempts = 0;
    const initialize = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id) {
        if (attempts++ >= 50) {
          toast("Google sign-in failed to load", "error");
          return;
        }
        timer = window.setTimeout(initialize, 100);
        return;
      }
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential: string }) => {
          loginWithGoogle(response.credential).catch((error: Error) => toast(error.message || "Google sign-in failed", "error"));
        },
      });
      google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(container.clientWidth || 320, 400),
      });
    };
    initialize();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      container.replaceChildren();
    };
  }, [googleClientId, loginWithGoogle, toast]);

  const submit = async () => {
    if (!email || !pw) return toast("Enter email and password", "error");
    setBusy(true);
    try {
      await login(email.trim(), pw);
      router.replace(destination as any);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }, desktop && { flexDirection: "row", minHeight: height, paddingBottom: 0 }]} keyboardShouldPersistTaps="handled">
        <View testID="login-brand-panel" style={[s.hero, desktop && s.desktopHero]}>
          <Image source={{ uri: HERO }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
          <LinearGradient colors={desktop ? [colors.scrim, "rgba(0,0,0,0.75)", colors.surface] : ["transparent", colors.scrim, colors.surface]} style={{ position: "absolute", width: "100%", height: "100%" }} />
          <View style={[s.heroInner, desktop ? s.desktopHeroInner : { paddingTop: insets.top }]}>
            <View style={s.brand}>
              <View style={s.badge}><Icon name="pickaxe" size={32} color={colors.onBrandPrimary} /></View>
              {desktop && <View style={{ gap: 4 }}><Body style={{ fontFamily: fonts.display, fontSize: 26, color: colors.onSurface }}>DRILLSTOCK PRO</Body><Label>Warehouse workspace</Label></View>}
            </View>
            {desktop ? <View style={{ gap: spacing.xl, maxWidth: 470 }}>
              <Label style={{ color: colors.brandPrimary }}>QLD + NSW warehouse operations</Label>
              <H1 style={{ fontSize: 52, lineHeight: 56 }}>Everything your warehouse needs.<H1 style={{ fontSize: 52, lineHeight: 56, color: colors.brandPrimary }}> In one place.</H1></H1>
              <Body style={{ fontSize: 17, lineHeight: 27 }}>Keep stock visible, receive supplier orders, and track equipment from arrival to the field.</Body>
              <View style={{ gap: spacing.lg }}>
                <View style={s.feature}><Icon name="qrcode-scan" size={23} color={colors.brandPrimary} /><Body>Find stock by item or bin</Body></View>
                <View style={s.feature}><Icon name="truck-check" size={23} color={colors.brandPrimary} /><Body>Scan orders and count arrivals</Body></View>
                <View style={s.feature}><Icon name="tools" size={23} color={colors.brandPrimary} /><Body>Know where your equipment is</Body></View>
              </View>
            </View> : <><H1>DrillStock Pro</H1><Body>QLD + NSW warehouse stock, bins & equipment register</Body></>}
            {desktop && <Label>Queensland · New South Wales</Label>}
          </View>
        </View>
        {!desktop && <View style={s.stripe} />}
        <View testID="login-form-panel" style={desktop ? s.desktopPanel : { alignItems: "center" }}>
        <View style={[s.form, desktop ? s.desktopForm : { width: "100%", maxWidth: 520 }]}>
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <Label style={{ color: colors.brandPrimary }}>Your warehouse workspace</Label>
            <H1>Welcome back</H1>
            <Body>Sign in to manage your day's work.</Body>
          </View>
          <Field testID="login-email-input" label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" autoComplete="email" editable={!busy} />
          <View>
            <Field testID="login-password-input" label="Password" value={pw} onChangeText={setPw} secureTextEntry={!show} placeholder="Enter your password" autoComplete="current-password" editable={!busy} style={{ paddingRight: 64 }} onSubmitEditing={submit} />
            <Pressable testID="login-toggle-password" accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"} onPress={() => setShow(!show)} style={{ position: "absolute", right: 8, bottom: 4, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
              <Icon name={show ? "eye-off" : "eye"} size={22} color={colors.muted} />
            </Pressable>
          </View>
          <Button testID="login-submit-button" title="Sign in" icon="login" large={!desktop} loading={busy} onPress={submit} />
          {Platform.OS === "web" && googleClientId && <Row style={{ gap: spacing.md }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Label>or</Label>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </Row>}
          {Platform.OS === "web" && googleClientId && (
            <View nativeID="google-signin-button" testID="login-google-button" style={{ alignItems: "center", minHeight: 44 }} />
          )}
          {DEMO.length > 0 && <>
            <View style={{ gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Label>Try a demo role</Label>
              <Body style={{ color: colors.muted, fontSize: 13 }}>Select a role to fill the sign-in details.</Body>
            </View>
            <Row>
              {DEMO.map((d) => (
                <Pressable key={d.label} testID={`demo-login-${d.label.toLowerCase().replace(" ", "-")}`} accessibilityRole="button" accessibilityLabel={`Fill ${d.label} demo login`} disabled={busy} style={s.demo} onPress={() => { setEmail(d.email); setPw(d.pw); }}>
                  <Body style={{ fontWeight: "700", color: colors.onSurface }}>{d.label}</Body>
                </Pressable>
              ))}
            </Row>
          </>}
        </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
