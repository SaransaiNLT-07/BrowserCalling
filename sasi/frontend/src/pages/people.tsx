import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PersonRow } from "@/components/person-row";
import { messageFrom, useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";
import type { CallType, PublicUser } from "@/types/models";

export function PeoplePage() {
  const { user } = useAuth();
  const { people, directoryLoading, directoryError, refreshDirectory, socketStatus, callState, startCall } =
    useRealtime();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const busy =
    callState.phase === "incoming" ||
    callState.phase === "outgoing" ||
    callState.phase === "connecting" ||
    callState.phase === "connected";

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
      navigate(`/call/${call.id}`);
    } catch (error) {
      setActionError(messageFrom(error, "The call could not be started."));
    }
  }

  return (
    <main className="page">
      <div className="header-row">
        <h1 className="title">People</h1>
        <p className="live">{socketStatus === "open" ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}</p>
      </div>
      <p className="subtitle">
        {user ? `${user.display_name}, call someone directly.` : "Call someone directly."} No rooms and no links.
      </p>
      <input
        className="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or username"
        aria-label="Search people"
        autoCapitalize="none"
      />
      {directoryError ? <p className="error">{directoryError}</p> : null}
      {actionError ? <p className="error">{actionError}</p> : null}
      {directoryLoading && people.length === 0 ? <p className="loading">Loading people</p> : null}
      {people.map((person) => (
        <PersonRow
          key={person.id}
          person={person}
          disabled={busy || socketStatus !== "open"}
          onCall={(callType) => void place(person, callType)}
        />
      ))}
      {!directoryLoading && people.length === 0 ? (
        <div className="empty">
          <h2>{query ? "No matches" : "No one else yet"}</h2>
          <p>{query ? "Try another name or username." : "When someone else registers, they will appear here."}</p>
        </div>
      ) : null}
    </main>
  );
}
