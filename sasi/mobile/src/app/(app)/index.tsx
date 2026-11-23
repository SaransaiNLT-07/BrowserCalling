import { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/empty-state";
import { LoadingBlock } from "@/components/loading-block";
import { PersonRow } from "@/components/person-row";
import { messageFrom, useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";
import type { CallType, PublicUser } from "@/types/models";
import { colors, fonts, layout } from "@/theme/tokens";

export default function PeopleScreen() {
  const { user } = useAuth();
  const { people, directoryLoading, directoryError, refreshDirectory, socketStatus, callState, startCall } = useRealtime();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = callState.phase === "incoming" || callState.phase === "outgoing" || callState.phase === "connecting" || callState.phase === "connected";

  useEffect(() => {
    const handle = setTimeout(() => {
      void refreshDirectory(query);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, refreshDirectory]);

  async function place(person: PublicUser, callType: CallType) {
    setActionError(null);
    try {
      const call = await startCall(person.id, callType);
      router.push(`/call/${call.id}` as Href);
    } catch (error) {
      setActionError(messageFrom(error, "The call could not be started."));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={directoryLoading} onRefresh={() => void refreshDirectory(query)} tintColor={colors.ink} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>People</Text>
              <Text style={styles.live}>{socketStatus === "open" ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}</Text>
            </View>
            <Text style={styles.subtitle}>
              {user ? `${user.display_name}, call someone directly.` : "Call someone directly."} No rooms and no links.
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or username"
              placeholderTextColor={colors.muted}
              style={styles.search}
              autoCapitalize="none"
              accessibilityLabel="Search people"
            />
            {directoryError ? <Text style={styles.error}>{directoryError}</Text> : null}
            {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
            {directoryLoading && people.length === 0 ? <LoadingBlock label="Loading people" /> : null}
          </View>
        }
        ListEmptyComponent={
          directoryLoading ? null : (
            <EmptyState
              title={query ? "No matches" : "No one else yet"}
              body={query ? "Try another name or username." : "When someone else registers, they will appear here."}
            />
          )
        }
        renderItem={({ item }) => <PersonRow person={item} disabled={busy || socketStatus !== "open"} onCall={(callType) => void place(item, callType)} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 22, paddingBottom: layout.tabBar + 24, width: "100%", maxWidth: layout.maxContent, alignSelf: "center" },
  header: { paddingTop: 12, gap: 10, marginBottom: 8 },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  title: { fontFamily: fonts.display, fontSize: 44, color: colors.ink },
  live: { fontFamily: fonts.semibold, color: colors.accent, fontSize: 14 },
  subtitle: { fontFamily: fonts.body, color: colors.muted, fontSize: 16, lineHeight: 22 },
  search: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 14 },
});
