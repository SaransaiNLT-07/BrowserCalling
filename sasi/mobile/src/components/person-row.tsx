import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/button";
import { Avatar } from "@/components/avatar";
import { PresenceDot } from "@/components/presence-dot";
import type { CallType, PublicUser } from "@/types/models";
import { colors, fonts } from "@/theme/tokens";

type Props = {
  person: PublicUser;
  disabled: boolean;
  onCall: (callType: CallType) => void;
};

export function PersonRow({ person, disabled, onCall }: Props) {
  const online = person.presence.status === "online";
  return (
    <View style={styles.row}>
      <Avatar name={person.display_name} />
      <View style={styles.copy}>
        <Text style={styles.name}>{person.display_name}</Text>
        <View style={styles.meta}>
          <PresenceDot online={online} />
          <Text style={styles.handle}>
            @{person.username} · {online ? "Online" : "Offline"}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button label="Audio" variant="ghost" disabled={disabled} onPress={() => onCall("audio")} accessibilityLabel={`Audio call ${person.display_name}`} />
        <Button label="Video" variant="secondary" disabled={disabled} onPress={() => onCall("video")} accessibilityLabel={`Video call ${person.display_name}`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  copy: { gap: 6 },
  name: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  handle: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  actions: { flexDirection: "row", gap: 8 },
});
