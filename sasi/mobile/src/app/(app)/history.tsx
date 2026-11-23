import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/empty-state";
import { LoadingBlock } from "@/components/loading-block";
import { useAuth } from "@/context/auth-context";
import { callLength, directionLabel, formatWhen, otherParty, stateLabel } from "@/lib/format";
import { getContainer } from "@/services/container";
import type { Call } from "@/types/models";
import { colors, fonts, layout } from "@/theme/tokens";

export default function HistoryScreen() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getContainer().calls.list();
      setCalls(page.results);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Call history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.ink} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>History</Text>
            <Text style={styles.subtitle}>Calls you placed and received.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && calls.length === 0 ? <LoadingBlock label="Loading history" /> : null}
          </View>
        }
        ListEmptyComponent={loading ? null : <EmptyState title="No calls yet" body="A call you place or receive will be listed here with its result." />}
        renderItem={({ item }) => {
          const person = user ? otherParty(item, user.id) : item.callee;
          const length = callLength(item);
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{person.display_name}</Text>
                <Text style={styles.state}>{stateLabel(item.state)}</Text>
              </View>
              <Text style={styles.meta}>
                {directionLabel(item, user?.id ?? "")}
                {length ? ` · ${length}` : ""}
              </Text>
              <Text style={styles.when}>{formatWhen(item.created_at)}</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 22, paddingBottom: layout.tabBar + 24, width: "100%", maxWidth: layout.maxContent, alignSelf: "center" },
  header: { paddingTop: 12, gap: 8, marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 44, color: colors.ink },
  subtitle: { fontFamily: fonts.body, color: colors.muted, fontSize: 16 },
  error: { fontFamily: fonts.body, color: colors.danger },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  name: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, flex: 1 },
  state: { fontFamily: fonts.medium, color: colors.inkSoft, fontSize: 14 },
  meta: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  when: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
});
