import { StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useRealtime } from "@/context/realtime-context";
import { colors, fonts } from "@/theme/tokens";

export function IncomingCall() {
  const { callState, acceptCall, declineCall } = useRealtime();
  const router = useRouter();
  const call = callState.call;
  if (callState.phase !== "incoming" || !call) return null;

  return (
    <View style={styles.overlay}>
      <Text style={styles.kicker}>Incoming {call.call_type}</Text>
      <Avatar name={call.caller.display_name} size={120} dark />
      <Text style={styles.name}>{call.caller.display_name}</Text>
      <Text style={styles.handle}>@{call.caller.username}</Text>
      <View style={styles.actions}>
        <Button
          label="Decline"
          variant="stage"
          onPress={() => {
            void declineCall();
          }}
        />
        <Button
          label="Accept"
          variant="primary"
          onPress={() => {
            void acceptCall().then(() => router.push(`/call/${call.id}` as Href));
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    backgroundColor: colors.stage,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  kicker: {
    fontFamily: fonts.medium,
    color: colors.stageMuted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontSize: 13,
    marginBottom: 12,
  },
  name: { fontFamily: fonts.display, fontSize: 42, color: colors.stageText, textAlign: "center" },
  handle: { fontFamily: fonts.body, color: colors.stageMuted, fontSize: 16, marginBottom: 18 },
  actions: { flexDirection: "row", gap: 12, marginTop: 12 },
});
