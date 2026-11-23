import { createElement, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import type { RtcStream } from "@/types/models";
import { colors, fonts } from "@/theme/tokens";

type Props = {
  local: RtcStream | null;
  remote: RtcStream | null;
  video: boolean;
  name: string;
};

function bind(
  node: HTMLMediaElement | null,
  stream: RtcStream | null,
  hooks?: { onBlocked?: () => void; onStarted?: () => void },
) {
  if (!node) return;
  const media = stream as MediaStream | null;
  if (node.srcObject !== media) node.srcObject = media;
  if (!media || media.getTracks().length === 0) return;
  const start = () => {
    void node.play?.().then(() => hooks?.onStarted?.()).catch(() => hooks?.onBlocked?.());
  };
  start();
  media?.getTracks().forEach((track) => {
    track.onunmute = start;
  });
}

export function MediaStage({ local, remote, video, name }: Props) {
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const [hearBlocked, setHearBlocked] = useState(false);

  useEffect(() => {
    const audioHooks = {
      onBlocked: () => setHearBlocked(true),
      onStarted: () => setHearBlocked(false),
    };
    bind(remoteVideo.current, video ? remote : null);
    bind(remoteAudio.current, remote, audioHooks);
    bind(localVideo.current, video ? local : null);
  }, [local, remote, video]);

  const remoteHasVideo = video && (remote?.getVideoTracks().length ?? 0) > 0;
  const localHasVideo = video && (local?.getVideoTracks().length ?? 0) > 0;

  return (
    <View style={styles.fill}>
      {remoteHasVideo
        ? createElement("video", {
            ref: (node: HTMLVideoElement | null) => {
              if (node) node.muted = true;
              remoteVideo.current = node;
              bind(node, remote);
            },
            autoPlay: true,
            playsInline: true,
            muted: true,
            style: videoStyle,
          })
        : (
          <View style={styles.audio}>
            <Avatar name={name} size={148} dark />
          </View>
        )}
      {createElement("audio", {
        ref: (node: HTMLAudioElement | null) => {
          remoteAudio.current = node;
          bind(node, remote, {
            onBlocked: () => setHearBlocked(true),
            onStarted: () => setHearBlocked(false),
          });
        },
        autoPlay: true,
      })}
      {hearBlocked ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void remoteAudio.current?.play().then(() => setHearBlocked(false)).catch(() => setHearBlocked(true));
          }}
          style={styles.hear}>
          <Text style={styles.hearLabel}>Tap to hear</Text>
        </Pressable>
      ) : null}
      {localHasVideo
        ? createElement("video", {
            ref: (node: HTMLVideoElement | null) => {
              if (node) node.muted = true;
              localVideo.current = node;
              bind(node, local);
            },
            autoPlay: true,
            playsInline: true,
            muted: true,
            style: pipStyle,
          })
        : null}
    </View>
  );
}

const videoStyle = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  backgroundColor: "#141210",
  zIndex: 0,
};

const pipStyle = {
  position: "absolute",
  width: 148,
  height: 198,
  right: 20,
  bottom: 140,
  objectFit: "cover",
  borderRadius: 18,
  transform: "scaleX(-1)",
  backgroundColor: "#221E1A",
  zIndex: 2,
};

const styles = StyleSheet.create({
  fill: { flex: 1, position: "relative", backgroundColor: "#141210", overflow: "hidden" },
  audio: { flex: 1, alignItems: "center", justifyContent: "center" },
  hear: {
    position: "absolute",
    top: 28,
    alignSelf: "center",
    zIndex: 3,
    backgroundColor: colors.paper,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  hearLabel: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 14 },
});
