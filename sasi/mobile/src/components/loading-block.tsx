import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme/tokens";

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 15 },
});
