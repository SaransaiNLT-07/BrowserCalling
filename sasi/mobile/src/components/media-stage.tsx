import { StyleSheet, View } from "react-native";
import { RTCView } from "react-native-webrtc";

import { Avatar } from "@/components/avatar";
import type { RtcStream } from "@/types/models";

type Props = {
  local: RtcStream | null;
  remote: RtcStream | null;
  video: boolean;
  name: string;
};

export function MediaStage({ local, remote, video, name }: Props) {
  const remoteUrl = remote?.toURL?.() ?? "";
  const localUrl = local?.toURL?.() ?? "";
  const showRemoteVideo = video && Boolean(remoteUrl);
  const showLocalVideo = video && Boolean(localUrl);

  return (
    <View style={styles.fill}>
      {showRemoteVideo ? (
        <RTCView streamURL={remoteUrl} style={styles.fill} objectFit="cover" />
      ) : (
        <View style={styles.audio}>
          <Avatar name={name} size={148} dark />
        </View>
      )}
      {showLocalVideo ? (
        <RTCView streamURL={localUrl} style={styles.pip} objectFit="cover" mirror zOrder={1} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#141210" },
  audio: { flex: 1, alignItems: "center", justifyContent: "center" },
  pip: {
    position: "absolute",
    width: 112,
    height: 156,
    right: 16,
    bottom: 132,
    borderRadius: 18,
    overflow: "hidden",
  },
});
