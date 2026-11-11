import { publicJoinUrl } from "lib/api"
import { useEffect, useState }                                 from "react"
import { GLOBAL }                                              from 'config/global.config'
import { Linking, Platform, Pressable, useWindowDimensions, View }      from "react-native"
import { Image }                                               from "expo-image"
import { useLocalSearchParams, useRouter }                     from "expo-router"
import { KeyboardAwareScrollView }                             from "react-native-keyboard-controller"
import { useSafeAreaInsets }                                   from "react-native-safe-area-context"
import { PATH }                                                from 'route/path'
import { useAuth }                                             from "state/auth"
import { Body, Button, Field, H1, Icon, Label, Row, useToast } from "component/ui"
import { makeStyles, radius, spacing, useTheme }               from "design/theme"


const DEMO = GLOBAL.ENABLE_DEMO_ACCOUNTS === "true" ? [
  { label: "Driller", email: GLOBAL.DEMO_DRILLER_EMAIL || "", pw: GLOBAL.DEMO_DRILLER_PASSWORD || "" },
  { label: "QLD Mgr", email: GLOBAL.DEMO_MANAGER_EMAIL || "", pw: GLOBAL.DEMO_MANAGER_PASSWORD || "" },
  { label: "Admin", email: GLOBAL.DEMO_ADMIN_EMAIL || "", pw: GLOBAL.DEMO_ADMIN_PASSWORD || "" },
].filter((account) => account.email && account.pw) : []

const useStyles = makeStyles((c) => ({
  root            : { flex: 1, backgroundColor: c.surface },
  hero            : { minHeight: 220, overflow: "hidden", backgroundColor: c.surfaceSecondary },
  heroInner       : { padding: spacing.xl, gap: spacing.xl },
  shapeField      : { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  upperShape      : { position: "absolute", width: "78%", height: "50%", top: "-16%", right: "-20%", borderRadius: 52, backgroundColor: c.surfaceTertiary, transform: [{ rotate: "-24deg" }] },
  lowerShape      : { position: "absolute", width: "96%", height: "60%", bottom: "-28%", left: "-23%", borderRadius: 64, backgroundColor: c.surface, transform: [{ rotate: "-25deg" }] },
  ring            : { position: "absolute", width: "56%", aspectRatio: 1, right: "-14%", bottom: "-9%", borderRadius: 999, borderWidth: 1, borderColor: c.borderStrong, opacity: 0.55 },
  desktopTitle    : { fontSize: 64, lineHeight: 68 },
  logo            : { width: 180, height: 68 },
  form            : { padding: spacing.xl, gap: spacing.lg },
  demo            : { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  stripe          : { height: 6, backgroundColor: c.brandPrimary },
  desktopHero     : { width: "52%", height: "auto", borderRightWidth: 1, borderRightColor: c.border },
  desktopHeroInner: { flex: 1, padding: 48, justifyContent: "space-between", gap: spacing.xxxl },
  desktopPanel    : { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl },
  desktopForm     : { width: "100%", maxWidth: 420, padding: 0 },
}))

export default function Login() {
  const s                                = useStyles()
  const { colors }                       = useTheme()
  const insets                           = useSafeAreaInsets()
  const { width, height }                = useWindowDimensions()
  const desktop                          = Platform.OS === "web" && width >= 960
  const { login, loginWithGoogle, user } = useAuth()
  const joinUrl = publicJoinUrl
  const toast                            = useToast()
  const router                           = useRouter()
  const { returnTo }                     = useLocalSearchParams<{ returnTo?: string }>()
  const destination                      = returnTo?.startsWith("/bin/") && !returnTo.startsWith("//") ? returnTo : PATH.TAB
  const [email, setEmail]                = useState("")
  const [pw, setPw]                      = useState("")
  const [show, setShow]                  = useState(false)
  const [busy, setBusy]                  = useState(false)
  const googleClientId                   = GLOBAL.GOOGLE_CLIENT_ID

  useEffect(() => {
    if (user) router.replace(destination as any)
  }, [destination, user, router])

  useEffect(() => {
    if (Platform.OS !== "web" || !googleClientId) return
    const container = document.getElementById("google-signin-button")
    if (!container) return

    let timer: number | undefined
    let attempts = 0
    const initialize = () => {
      const google = (window as any).google
      if (!google?.accounts?.id) {
        if (attempts++ >= 50) {
          toast("Google sign-in failed to load", "error")
          return
        }
        timer = window.setTimeout(initialize, 100)
        return
      }
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: { credential: string }) => {
          loginWithGoogle(response.credential).catch((error: Error) => toast(error.message || "Google sign-in failed", "error"))
        },
      })
      google.accounts.id.renderButton(container, {
        type : "standard",
        theme: "outline",
        size : "large",
        text : "continue_with",
        shape: "rectangular",
        width: Math.min(container.clientWidth || 320, 400),
      })
    }
    initialize()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      container.replaceChildren()
    }
  }, [googleClientId, loginWithGoogle, toast])

  const submit = async () => {
    if (!email || !pw) return toast("Enter email and password", "error")
    setBusy(true)
    try {
      await login(email.trim(), pw)
      router.replace(destination as any)
    } catch (e: any) {
      toast(e.message, "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }, desktop && { flexDirection: "row", minHeight: height, paddingBottom: 0 }]} keyboardShouldPersistTaps="handled">
        <View testID="login-brand-panel" style={[s.hero, desktop && s.desktopHero]}>
          <View pointerEvents="none" accessible={false} style={s.shapeField}>
            <View style={s.upperShape} />
            <View style={s.lowerShape} />
            <View style={s.ring} />
          </View>
          <View style={[s.heroInner, desktop ? s.desktopHeroInner : { paddingTop: insets.top + spacing.xl }]}>
            <Image source={require("../asset/image/sis-logo.png")} accessibilityLabel="Site Investigation Supply" contentFit="contain" style={s.logo} />
            <H1 style={desktop ? s.desktopTitle : undefined}>Companion App</H1>
            {desktop && <Label>Queensland · New South Wales</Label>}
          </View>
        </View>
        {!desktop && <View style={s.stripe} />}
        <View testID="login-form-panel" style={desktop ? s.desktopPanel : { alignItems: "center" }}>
        <View style={[s.form, desktop ? s.desktopForm : { width: "100%", maxWidth: 520 }]}>
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            {/* <Label style={{ color: colors.brandPrimary }}>Your warehouse workspace</Label> */}
            <H1>Welcome back</H1>
            {/* <Body>Sign in to manage your day's work.</Body> */}
          </View>
          <Field testID="login-email-input" label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" autoComplete="email" editable={!busy} />
          <View>
            <Field testID="login-password-input" label="Password" value={pw} onChangeText={setPw} secureTextEntry={!show} placeholder="Enter your password" autoComplete="current-password" editable={!busy} style={{ paddingRight: 64 }} onSubmitEditing={submit} />
            <Pressable testID="login-toggle-password" accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"} onPress={() => setShow(!show)} style={{ position: "absolute", right: 8, bottom: 4, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
              <Icon name={show ? "eye-off" : "eye"} size={22} color={colors.muted} />
            </Pressable>
          </View>
          <Button testID="login-submit-button" title="Sign in" icon="login" large={!desktop} loading={busy} onPress={submit} />
          {joinUrl && (
            <View style={{ gap: spacing.sm }}>
              <Body>New to SIS Companion?</Body>
              <Button
                testID="login-request-access-button"
                title="Request access"
                variant="ghost"
                onPress={() => {
                  Linking.openURL(joinUrl).catch(() => toast("Could not open request form", "error"))
                }}
              />
            </View>
          )}
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
                <Pressable key={d.label} testID={`demo-login-${d.label.toLowerCase().replace(" ", "-")}`} accessibilityRole="button" accessibilityLabel={`Fill ${d.label} demo login`} disabled={busy} style={s.demo} onPress={() => { setEmail(d.email); setPw(d.pw) }}>
                  <Body style={{ fontWeight: "700", color: colors.onSurface }}>{d.label}</Body>
                </Pressable>
              ))}
            </Row>
          </>}
        </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}
