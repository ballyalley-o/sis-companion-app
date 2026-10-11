import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { Body, Button, Field, H1, Icon, Label, Row, useToast } from "@/src/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1562237553-fd52cb2067b6?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200";

const DEMO = [
  { label: "Driller", email: "jake@drillstock.com", pw: "Driller@123" },
  { label: "QLD Mgr", email: "qld.manager@drillstock.com", pw: "Manager@123" },
  { label: "Admin", email: "admin@drillstock.com", pw: "Admin@12345" },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 300, justifyContent: "flex-end" },
  heroInner: { padding: spacing.xl, gap: spacing.sm },
  badge: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  form: { padding: spacing.xl, gap: spacing.lg },
  demo: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  stripe: { height: 6, backgroundColor: c.brandPrimary },
}));

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, loginWithGoogle, user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gBusy, setGBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  const google = async () => {
    setGBusy(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      toast(e.message || "Google sign-in failed", "error");
    } finally {
      setGBusy(false);
    }
  };

  const submit = async () => {
    if (!email || !pw) return toast("Enter email and password", "error");
    setBusy(true);
    try {
      await login(email.trim(), pw);
      router.replace("/(tabs)");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <Image source={{ uri: HERO }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" />
          <LinearGradient colors={["transparent", colors.scrim, colors.surface]} style={{ position: "absolute", width: "100%", height: "100%" }} />
          <View style={[s.heroInner, { paddingTop: insets.top }]}>
            <View style={s.badge}><Icon name="pickaxe" size={32} color={colors.onBrandPrimary} /></View>
            <H1>DrillStock Pro</H1>
            <Body>QLD + NSW warehouse stock, bins & equipment register</Body>
          </View>
        </View>
        <View style={s.stripe} />
        <View style={s.form}>
          <Field testID="login-email-input" label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" autoComplete="email" />
          <View>
            <Field testID="login-password-input" label="Password" value={pw} onChangeText={setPw} secureTextEntry={!show} placeholder="••••••••" onSubmitEditing={submit} />
            <Pressable testID="login-toggle-password" onPress={() => setShow(!show)} style={{ position: "absolute", right: 8, bottom: 4, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
              <Icon name={show ? "eye-off" : "eye"} size={22} color={colors.muted} />
            </Pressable>
          </View>
          <Button testID="login-submit-button" title="Sign in" icon="login" large loading={busy} onPress={submit} />
          <Row style={{ gap: spacing.md }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Label>or</Label>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </Row>
          <Button testID="login-google-button" title="Continue with Google" icon="google" variant="secondary" loading={gBusy} onPress={google} />
          <Label style={{ marginTop: spacing.sm }}>Demo accounts</Label>
          <Row>
            {DEMO.map((d) => (
              <Pressable key={d.label} testID={`demo-login-${d.label.toLowerCase().replace(" ", "-")}`} style={s.demo} onPress={() => { setEmail(d.email); setPw(d.pw); }}>
                <Body style={{ fontWeight: "700", color: colors.onSurface }}>{d.label}</Body>
              </Pressable>
            ))}
          </Row>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
