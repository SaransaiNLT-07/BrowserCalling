import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/theme/tokens";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 22,
    gap: 8,
    backgroundColor: colors.white,
  },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted },
});
