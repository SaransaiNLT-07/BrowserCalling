import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter, type Href } from "expo-router";

import { useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";
import { otherParty } from "@/lib/format";
import { colors, fonts } from "@/theme/tokens";

export function LiveCallBanner() {
  const { user } = useAuth();
  const { callState } = useRealtime();
  const pathname = usePathname();
  const router = useRouter();
  const call = callState.call;
  if (!user || !call) return null;
  if (callState.phase === "idle" || callState.phase === "ended" || callState.phase === "incoming") return null;
  if (pathname.startsWith("/call/")) return null;
  const person = otherParty(call, user.id);
  const label =
    callState.phase === "outgoing" ? `Calling ${person.display_name}` : `${person.display_name} · ${call.call_type}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Return to call"
      style={styles.banner}
      onPress={() => router.push(`/call/${call.id}` as Href)}>
      <View style={styles.dot} />
      <Text style={styles.text}>{label}</Text>
      <Text style={styles.action}>Return</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: colors.ink,
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#D7EBE3" },
  text: { flex: 1, color: colors.stageText, fontFamily: fonts.medium, fontSize: 14 },
  action: { color: colors.accentSoft, fontFamily: fonts.semibold, fontSize: 14 },
});
