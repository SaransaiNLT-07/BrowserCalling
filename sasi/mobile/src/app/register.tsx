import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, type Href } from "expo-router";

import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { messageFrom, useAuth } from "@/context/auth-context";
import { ApiError } from "@/services/api-client";
import { fieldMessage } from "@/lib/format";
import { colors, fonts, layout } from "@/theme/tokens";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await register({
        display_name: displayName,
        username,
        email,
        password,
      });
    } catch (caught) {
      if (caught instanceof ApiError) setFields(caught.fields ?? {});
      setError(messageFrom(caught, "The account could not be created."));
    } finally {
      setSubmitting(false);
    }
  }

  const ready = displayName.trim() && username.trim() && email.trim() && password.length >= 10;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        <Text style={styles.kicker}>Saran</Text>
        <Text style={styles.title}>Create an account</Text>
        <Text style={styles.subtitle}>A display name, a handle, and a password of at least 10 characters.</Text>
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" error={fieldMessage(fields, "display_name")} />
        <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" error={fieldMessage(fields, "username")} />
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" error={fieldMessage(fields, "email")} />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={fieldMessage(fields, "password")} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={submitting ? "Creating account" : "Create account"} disabled={!ready || submitting} onPress={() => void submit()} />
        <Link href={"/sign-in" as Href} style={styles.link}>
          <Text style={styles.linkText}>Already have an account</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.paper, padding: 24, justifyContent: "center" },
  form: { width: "100%", maxWidth: layout.maxContent, alignSelf: "center", gap: 14 },
  kicker: { fontFamily: fonts.medium, color: colors.accent, letterSpacing: 1.4, textTransform: "uppercase", fontSize: 12 },
  title: { fontFamily: fonts.display, fontSize: 46, color: colors.ink },
  subtitle: { fontFamily: fonts.body, color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 8 },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 14 },
  link: { alignSelf: "flex-start", paddingVertical: 8 },
  linkText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 15 },
});
