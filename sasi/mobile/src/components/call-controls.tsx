import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme/tokens";

type Props = {
  muted: boolean;
  cameraEnabled: boolean;
  video: boolean;
  onMute: () => void;
  onCamera: () => void;
  onSwitch: () => void;
  onHangUp: () => void;
};

function RoundButton({
  label,
  active,
  danger,
  onPress,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.round, active && styles.active, danger && styles.danger]}>
      <Text style={[styles.roundLabel, active && !danger && styles.roundLabelInverse]}>{label}</Text>
    </Pressable>
  );
}

export function CallControls({ muted, cameraEnabled, video, onMute, onCamera, onSwitch, onHangUp }: Props) {
  return (
    <View style={styles.row}>
      <RoundButton label={muted ? "Unmute" : "Mute"} active={muted} onPress={onMute} />
      {video ? <RoundButton label={cameraEnabled ? "Camera" : "Cam off"} active={!cameraEnabled} onPress={onCamera} /> : null}
      {video ? <RoundButton label="Flip" onPress={onSwitch} /> : null}
      <RoundButton label="End" danger onPress={onHangUp} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  round: {
    minWidth: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(246,241,231,0.08)",
    borderWidth: 1,
    borderColor: colors.stageLine,
    paddingHorizontal: 10,
  },
  active: { backgroundColor: colors.stageText },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger, minWidth: 88 },
  roundLabel: { fontFamily: fonts.semibold, color: colors.stageText, fontSize: 13 },
  roundLabelInverse: { color: colors.ink },
});
