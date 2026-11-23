import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Link, type Href } from "expo-router";

import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { messageFrom, useAuth } from "@/context/auth-context";
import { ApiError } from "@/services/api-client";
import { fieldMessage } from "@/lib/format";
import { colors, fonts, layout } from "@/theme/tokens";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
    setFields({});
  }, [email, password]);

  async function submit() {
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (caught) {
      if (caught instanceof ApiError) setFields(caught.fields ?? {});
      setError(messageFrom(caught, "Sign in failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.page, wide && styles.pageWide]} keyboardShouldPersistTaps="handled">
      {wide ? (
        <View style={styles.panel}>
          <Text style={styles.panelKicker}>Saran</Text>
          <Text style={styles.panelTitle}>A direct line between two people.</Text>
          <Text style={styles.panelBody}>
            Presence shows who can pick up. Audio and video stay one to one. When the call ends, the camera and microphone are released.
          </Text>
        </View>
      ) : null}
      <View style={styles.form}>
        <Text style={styles.kicker}>Saran</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Use the email and password for your account.</Text>
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" error={fieldMessage(fields, "email")} />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" error={fieldMessage(fields, "password")} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={submitting ? "Signing in" : "Sign in"} disabled={submitting || !email || !password} onPress={() => void submit()} />
        <Link href={"/register" as Href} style={styles.link}>
          <Text style={styles.linkText}>Create an account</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.paper, padding: 24, justifyContent: "center" },
  pageWide: { flexDirection: "row", padding: 32, gap: 28, alignItems: "stretch" },
  panel: {
    flex: 1,
    maxWidth: 460,
    backgroundColor: colors.ink,
    borderRadius: 28,
    padding: 36,
    justifyContent: "flex-end",
    gap: 16,
  },
  panelKicker: { fontFamily: fonts.medium, color: colors.accentSoft, letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12 },
  panelTitle: { fontFamily: fonts.display, color: colors.stageText, fontSize: 48, lineHeight: 52 },
  panelBody: { fontFamily: fonts.body, color: colors.stageMuted, fontSize: 16, lineHeight: 24 },
  form: { flex: 1, maxWidth: layout.maxContent, width: "100%", alignSelf: "center", gap: 14, justifyContent: "center" },
  kicker: { fontFamily: fonts.medium, color: colors.accent, letterSpacing: 1.4, textTransform: "uppercase", fontSize: 12 },
  title: { fontFamily: fonts.display, fontSize: 48, color: colors.ink },
  subtitle: { fontFamily: fonts.body, color: colors.muted, fontSize: 16, marginBottom: 8 },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 14 },
  link: { alignSelf: "flex-start", paddingVertical: 8 },
  linkText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 15 },
});
