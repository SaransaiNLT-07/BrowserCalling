import { useNavigate } from "react-router-dom";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useRealtime } from "@/context/realtime-context";

export function IncomingCall() {
  const { callState, acceptCall, declineCall } = useRealtime();
  const navigate = useNavigate();
  const call = callState.call;
  if (callState.phase !== "incoming" || !call) return null;

  return (
    <div className="incoming" role="dialog" aria-label="Incoming call">
      <p className="call-kicker">Incoming {call.call_type}</p>
      <Avatar name={call.caller.display_name} size={120} dark />
      <h1 className="call-name">{call.caller.display_name}</h1>
      <p className="call-status">@{call.caller.username}</p>
      <div className="actions">
        <Button type="button" variant="stage" onClick={() => void declineCall()}>
          Decline
        </Button>
        <Button
          type="button"
          onClick={() => {
            void acceptCall().then(() => navigate(`/call/${call.id}`));
          }}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
