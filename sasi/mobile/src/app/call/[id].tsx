import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { CallControls } from "@/components/call-controls";
import { MediaStage } from "@/components/media-stage";
import { useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";
import { endReasonCopy, formatDuration, otherParty } from "@/lib/format";
import { getContainer } from "@/services/container";
import type { Call } from "@/types/models";
import { colors, fonts } from "@/theme/tokens";

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { callState, hangUp, toggleMute, toggleCamera, switchCamera, dismissEnded } = useRealtime();
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  const [archive, setArchive] = useState<Call | null>(null);
  const live = callState.call?.id === id ? callState.call : null;
  const call = live ?? archive;

  useEffect(() => {
    if (!callState.connectedAt || callState.phase !== "connected") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callState.connectedAt, callState.phase]);

  useEffect(() => {
    if (!id || callState.call?.id === id) return;
    let active = true;
    getContainer()
      .calls.retrieve(id)
      .then((found) => {
        if (active) setArchive(found);
      })
      .catch(() => {
        if (active) setArchive(null);
      });
    return () => {
      active = false;
    };
  }, [id, callState.call?.id]);

  const person = call && user ? otherParty(call, user.id) : null;
  const phase = live ? callState.phase : "ended";
  const video = call?.call_type === "video";
  const status =
    phase === "outgoing"
      ? "Calling"
      : phase === "connecting"
        ? "Connecting"
        : phase === "connected" && callState.connectedAt
          ? formatDuration(now - callState.connectedAt)
          : phase === "ended" && call
            ? endReasonCopy(call, user?.id ?? "")
            : "Looking up the call";

  function leave() {
    dismissEnded();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <View style={styles.stage}>
      <StatusBar style="light" />
      <MediaStage local={live ? callState.localStream : null} remote={live ? callState.remoteStream : null} video={Boolean(video) && phase !== "ended"} name={person?.display_name ?? "Saran"} />
      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.kicker}>{call?.call_type === "audio" ? "Audio" : "Video"}</Text>
          <Text style={styles.name}>{person?.display_name ?? "Call"}</Text>
          <Text style={styles.status}>{status}</Text>
          {callState.error && phase !== "ended" ? <Text style={styles.error}>{callState.error}</Text> : null}
        </View>
        <View style={styles.footer}>
          {phase === "outgoing" ? <Button label="Cancel" variant="danger" onPress={() => void hangUp()} /> : null}
          {phase === "connecting" || phase === "connected" ? (
            <CallControls
              muted={callState.muted}
              cameraEnabled={callState.cameraEnabled}
              video={Boolean(video)}
              onMute={toggleMute}
              onCamera={toggleCamera}
              onSwitch={() => void switchCamera()}
              onHangUp={() => void hangUp()}
            />
          ) : null}
          {phase === "ended" || !call ? <Button label="Back to people" variant="stage" onPress={leave} /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: colors.stage },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "space-between",
    padding: 22,
  },
  header: { gap: 6, alignItems: "center", paddingTop: 12 },
  kicker: { fontFamily: fonts.medium, color: colors.stageMuted, letterSpacing: 1.4, textTransform: "uppercase", fontSize: 12 },
  name: { fontFamily: fonts.display, color: colors.stageText, fontSize: 36, textAlign: "center" },
  status: { fontFamily: fonts.body, color: colors.stageMuted, fontSize: 16 },
  error: { fontFamily: fonts.body, color: "#F0C2B8", fontSize: 14, textAlign: "center", marginTop: 8 },
  footer: { gap: 16, paddingBottom: 12 },
});
