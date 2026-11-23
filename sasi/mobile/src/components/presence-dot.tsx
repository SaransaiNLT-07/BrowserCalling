import { StyleSheet, View } from "react-native";

import { colors } from "@/theme/tokens";

export function PresenceDot({ online }: { online: boolean }) {
  return <View style={[styles.dot, online ? styles.online : styles.offline]} />;
}

const styles = StyleSheet.create({
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  online: { backgroundColor: colors.online },
  offline: { backgroundColor: colors.line, borderWidth: 1, borderColor: colors.muted },
});
