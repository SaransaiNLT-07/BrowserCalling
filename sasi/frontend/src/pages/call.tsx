import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/button";
import { CallControls } from "@/components/call-controls";
import { MediaStage } from "@/components/media-stage";
import { useAuth } from "@/context/auth-context";
import { useRealtime } from "@/context/realtime-context";
import { endReasonCopy, formatDuration, otherParty } from "@/lib/format";
import { getContainer } from "@/services/container";
import type { Call } from "@/types/models";

export function CallPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { callState, hangUp, toggleMute, toggleCamera, switchCamera, dismissEnded } = useRealtime();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [archive, setArchive] = useState<Call | null>(null);
  const live = callState.call?.id === id ? callState.call : null;
  const call = live ?? archive;

  useEffect(() => {
    if (!callState.connectedAt || callState.phase !== "connected") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [callState.connectedAt, callState.phase]);

  useEffect(() => {
    if (!id || callState.call?.id === id) return;
    let active = true;
    getContainer()
      .calls.retrieve(id)
      .then((found) => {
        if (active) setArchive(found);
      })
      .catch(() => {
        if (active) setArchive(null);
      });
    return () => {
      active = false;
    };
  }, [id, callState.call?.id]);

  const person = call && user ? otherParty(call, user.id) : null;
  const phase = live ? callState.phase : "ended";
  const video = call?.call_type === "video";
  const status =
    phase === "outgoing"
      ? "Calling"
      : phase === "connecting"
        ? "Connecting"
        : phase === "connected" && callState.connectedAt
          ? formatDuration(now - callState.connectedAt)
          : phase === "ended" && call
            ? endReasonCopy(call, user?.id ?? "")
            : "Looking up the call";

  function leave() {
    dismissEnded();
    navigate("/");
  }

  return (
    <div className="call-screen">
      <MediaStage
        local={live ? callState.localStream : null}
        remote={live ? callState.remoteStream : null}
        video={Boolean(video) && phase !== "ended"}
        name={person?.display_name ?? "Saran"}
      />
      <div className="call-overlay">
        <div className="call-header">
          <p className="call-kicker">{call?.call_type === "audio" ? "Audio" : "Video"}</p>
          <h1 className="call-name">{person?.display_name ?? "Call"}</h1>
          <p className="call-status">{status}</p>
          {callState.error && phase !== "ended" ? <p className="error">{callState.error}</p> : null}
        </div>
        <div className="call-footer">
          {phase === "outgoing" ? (
            <Button type="button" variant="danger" onClick={() => void hangUp()}>
              Cancel
            </Button>
          ) : null}
          {phase === "connecting" || phase === "connected" ? (
            <CallControls
              muted={callState.muted}
              cameraEnabled={callState.cameraEnabled}
              video={Boolean(video)}
              onMute={toggleMute}
              onCamera={toggleCamera}
              onSwitch={() => void switchCamera()}
              onHangUp={() => void hangUp()}
            />
          ) : null}
          {phase === "ended" || !call ? (
            <Button type="button" variant="stage" onClick={leave}>
              Back to people
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
