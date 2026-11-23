import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { messageFrom, useAuth } from "@/context/auth-context";
import { colors, fonts, layout } from "@/theme/tokens";

export default function AccountScreen() {
  const { user, updateDisplayName, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await updateDisplayName(displayName);
      setMessage("Display name saved.");
    } catch (caught) {
      setError(messageFrom(caught, "The name could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.content}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.handle}>@{user?.username}</Text>
        <TextField label="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={saving ? "Saving" : "Save name"} disabled={saving || !displayName.trim()} onPress={() => void save()} />
        <Button
          label={confirming ? "Tap again to sign out" : "Sign out"}
          variant={confirming ? "danger" : "ghost"}
          onPress={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            void signOut();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 14, width: "100%", maxWidth: layout.maxContent, alignSelf: "center", paddingBottom: layout.tabBar + 24 },
  title: { fontFamily: fonts.display, fontSize: 44, color: colors.ink },
  email: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 16 },
  handle: { fontFamily: fonts.medium, color: colors.muted, fontSize: 15, marginBottom: 8 },
  message: { fontFamily: fonts.body, color: colors.accent },
  error: { fontFamily: fonts.body, color: colors.danger },
});
