import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { colors, fonts } from "@/theme/tokens";

type Props = TextInputProps & {
  label: string;
  error?: string | null;
};

export function TextField({ label, error, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={[styles.input, error ? styles.inputError : null]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 13 },
});
