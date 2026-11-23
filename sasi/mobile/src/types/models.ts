export type PresenceStatus = "online" | "offline";

export type Presence = {
  status: PresenceStatus;
  last_seen_at: string | null;
};

export type PublicUser = {
  id: string;
  username: string;
  display_name: string;
  presence: Presence;
};

export type MeUser = PublicUser & {
  email: string;
};

export type CallType = "audio" | "video";

export type CallState =
  | "ringing"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "missed"
  | "ended"
  | "failed";

export type Call = {
  id: string;
  caller: PublicUser;
  callee: PublicUser;
  call_type: CallType;
  state: CallState;
  end_reason: string;
  ended_by: string | null;
  created_at: string;
  accepted_at: string | null;
  ended_at: string | null;
};

export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type SessionDescription = {
  type: "offer" | "answer";
  sdp: string;
};

export type IceCandidateInit = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type RtcTrack = {
  kind: string;
  enabled: boolean;
  stop: () => void;
};

export type RtcStream = {
  toURL?: () => string;
  getTracks: () => RtcTrack[];
  getAudioTracks: () => RtcTrack[];
  getVideoTracks: () => RtcTrack[];
};

export type ClientAction =
  | { action: "ping" }
  | { action: "call.accept"; call_id: string }
  | { action: "call.reject"; call_id: string }
  | { action: "call.cancel"; call_id: string }
  | { action: "call.end"; call_id: string }
  | { action: "call.fail"; call_id: string; reason: "media_denied" | "ice_failed" | "connection_lost" }
  | { action: "call.offer"; call_id: string; sdp: SessionDescription }
  | { action: "call.answer"; call_id: string; sdp: SessionDescription }
  | { action: "call.ice"; call_id: string; candidate: IceCandidateInit }
  | { action: "call.negotiate"; call_id: string };

export type ServerEvent =
  | { type: "pong" }
  | { type: "error"; code: string; detail: string }
  | { type: "presence.update"; user_id: string; status: PresenceStatus; last_seen_at: string | null }
  | { type: "call.state"; call: Call }
  | { type: "call.offer"; call_id: string; from_user_id: string; sdp: SessionDescription }
  | { type: "call.answer"; call_id: string; from_user_id: string; sdp: SessionDescription }
  | { type: "call.ice"; call_id: string; from_user_id: string; candidate: IceCandidateInit }
  | { type: "call.negotiate"; call_id: string };

export type CallPhase = "idle" | "incoming" | "outgoing" | "connecting" | "connected" | "ended";

export type CallUiState = {
  call: Call | null;
  phase: CallPhase;
  localStream: RtcStream | null;
  remoteStream: RtcStream | null;
  muted: boolean;
  cameraEnabled: boolean;
  error: string | null;
  connectedAt: number | null;
};

export type RegisterInput = {
  email: string;
  username: string;
  display_name: string;
  password: string;
};

export type SessionResponse = {
  access: string;
  refresh: string;
  user: MeUser;
};
