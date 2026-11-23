import { StyleSheet, View } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveCallBanner } from "@/components/live-call-banner";
import { colors, fonts } from "@/theme/tokens";

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.paper,
            borderTopColor: colors.line,
            height: 62 + insets.bottom,
            paddingTop: 6,
            paddingBottom: insets.bottom + 6,
          },
          tabBarShowLabel: true,
          tabBarIconStyle: { display: "none", width: 0, height: 0 },
          tabBarLabelStyle: {
            fontFamily: fonts.semibold,
            fontSize: 13,
          },
        }}>
        <Tabs.Screen name="index" options={{ title: "People" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
        <Tabs.Screen name="account" options={{ title: "Account" }} />
      </Tabs>
      <LiveCallBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
});
