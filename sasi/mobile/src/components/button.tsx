import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/theme/tokens";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "stage";

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = "primary", disabled, style, ...props }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      {...props}>
      <Text style={[styles.label, variant === "primary" || variant === "danger" ? styles.labelLight : styles.labelDark, variant === "stage" && styles.labelLight]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.paperDeep },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  stage: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.stageLine },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  labelLight: { color: colors.stageText },
  labelDark: { color: colors.ink },
});
