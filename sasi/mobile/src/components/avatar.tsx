import { StyleSheet, Text, View } from "react-native";

import { monogram } from "@/lib/format";
import { colors, fonts } from "@/theme/tokens";

export function Avatar({ name, size = 48, dark = false }: { name: string; size?: number; dark?: boolean }) {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dark ? colors.stageSoft : colors.paperDeep,
        },
      ]}>
      <Text style={[styles.letters, { fontSize: size * 0.32, color: dark ? colors.stageText : colors.ink }]}>
        {monogram(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  letters: { fontFamily: fonts.display },
});
