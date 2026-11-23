import type { IceCandidateInit, RtcStream, SessionDescription } from "@/types/models";

export type PeerCallbacks = {
  onIceCandidate: (candidate: IceCandidateInit) => void;
  onRemoteStream: (stream: RtcStream) => void;
  onConnectionState: (state: string) => void;
};

export interface RtcEngine {
  getUserMedia: (video: boolean) => Promise<RtcStream>;
  createPeer: (callbacks: PeerCallbacks) => void;
  addLocalTracks: () => void;
  createOffer: () => Promise<SessionDescription>;
  createAnswer: (offer: SessionDescription) => Promise<SessionDescription>;
  applyAnswer: (answer: SessionDescription) => Promise<void>;
  addIceCandidate: (candidate: IceCandidateInit) => Promise<void>;
  setMuted: (muted: boolean) => void;
  setCameraEnabled: (enabled: boolean) => void;
  switchCamera: () => Promise<void>;
  close: () => void;
}
