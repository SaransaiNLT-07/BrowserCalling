import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from "@expo-google-fonts/outfit";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { IncomingCall } from "@/components/incoming-call";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { RealtimeProvider } from "@/context/realtime-context";
import { colors, fonts } from "@/theme/tokens";

import "@/global.css";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Gate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const root = segments[0];
    const authRoute = root === "sign-in" || root === "register";
    if (status === "anonymous" && !authRoute) router.replace("/sign-in");
    if (status === "authenticated" && authRoute) router.replace("/");
  }, [status, segments, router]);

  if (status === "loading") {
    return (
      <View style={styles.boot}>
        <Text style={styles.word}>Saran</Text>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return children;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RealtimeProvider>
          <StatusBar style="dark" />
          <Gate>
            <View style={styles.fill}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.paper },
                }}>
                <Stack.Screen name="(app)" />
                <Stack.Screen name="sign-in" />
                <Stack.Screen name="register" />
                <Stack.Screen name="call/[id]" options={{ animation: "fade" }} />
              </Stack>
              <IncomingCall />
            </View>
          </Gate>
        </RealtimeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  boot: { flex: 1, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", gap: 16 },
  word: { fontFamily: fonts.display, fontSize: 42, color: colors.ink },
});
