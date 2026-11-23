import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/context/auth-context";
import { callLength, directionLabel, formatWhen, otherParty, stateLabel } from "@/lib/format";
import { getContainer } from "@/services/container";
import type { Call } from "@/types/models";

export function HistoryPage() {
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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page">
      <h1 className="title">History</h1>
      <p className="subtitle">Calls you placed and received.</p>
      {error ? <p className="error">{error}</p> : null}
      {loading && calls.length === 0 ? <p className="loading">Loading history</p> : null}
      {calls.map((item) => {
        const person = user ? otherParty(item, user.id) : item.callee;
        const length = callLength(item);
        return (
          <article className="history-row" key={item.id}>
            <div className="history-top">
              <h2 className="history-name">{person.display_name}</h2>
              <span>{stateLabel(item.state)}</span>
            </div>
            <p className="meta-row">
              {directionLabel(item, user?.id ?? "")}
              {length ? ` · ${length}` : ""}
            </p>
            <p className="meta-row">{formatWhen(item.created_at)}</p>
          </article>
        );
      })}
      {!loading && calls.length === 0 ? (
        <div className="empty">
          <h2>No calls yet</h2>
          <p>A call you place or receive will be listed here with its result.</p>
        </div>
      ) : null}
    </main>
  );
}
