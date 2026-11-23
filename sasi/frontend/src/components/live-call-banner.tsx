import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";
import { otherParty } from "@/lib/format";

export function LiveCallBanner() {
  const { user } = useAuth();
  const { callState } = useRealtime();
  const location = useLocation();
  const call = callState.call;
  if (!user || !call) return null;
  if (callState.phase === "idle" || callState.phase === "ended" || callState.phase === "incoming") return null;
  if (location.pathname.startsWith("/call/")) return null;
  const person = otherParty(call, user.id);
  const label =
    callState.phase === "outgoing" ? `Calling ${person.display_name}` : `${person.display_name} · ${call.call_type}`;

  return (
    <Link className="banner" to={`/call/${call.id}`} aria-label="Return to call">
      <span className="dot on" />
      <span>{label}</span>
      <span>Return</span>
    </Link>
  );
}
