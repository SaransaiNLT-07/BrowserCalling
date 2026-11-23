import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from "react-native-webrtc";

import type { RtcEngine } from "@/services/rtc-engine.types";
import type { IceCandidateInit, IceServer, RtcStream, SessionDescription } from "@/types/models";

type NativePeer = RTCPeerConnection;

export function createRtcEngine(servers: IceServer[]): RtcEngine {
  let peer: NativePeer | null = null;
  let local: MediaStream | null = null;
  let closed = false;
  let remoteReady = false;
  const iceQueue: IceCandidateInit[] = [];
  const flushIce = async () => {
    const queued = iceQueue.splice(0, iceQueue.length);
    for (const candidate of queued) {
      if (!peer) return;
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  return {
    async getUserMedia(video) {
      local = await mediaDevices.getUserMedia({
        audio: true,
        video: video
          ? {
              facingMode: "user",
              width: 1280,
              height: 720,
              frameRate: 30,
            }
          : false,
      });
      return local as unknown as RtcStream;
    },
    createPeer(next) {
      peer = new RTCPeerConnection({ iceServers: servers });
      const connection = peer as RTCPeerConnection & {
        onicecandidate: ((event: { candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null }) => void) | null;
        ontrack: ((event: { streams?: Array<unknown> }) => void) | null;
        onconnectionstatechange: (() => void) | null;
      };
      connection.onicecandidate = (event: { candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null }) => {
        const candidate = event.candidate;
        if (!candidate?.candidate || closed) return;
        next.onIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid ?? null,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        });
      };
      connection.ontrack = (event: { streams?: Array<unknown> }) => {
        const remote = event.streams?.[0];
        if (remote && !closed) next.onRemoteStream(remote as RtcStream);
      };
      connection.onconnectionstatechange = () => {
        if (!closed && peer) next.onConnectionState(peer.connectionState);
      };
    },
    addLocalTracks() {
      if (!peer || !local) throw new Error("The peer connection is not ready.");
      local.getTracks().forEach((track) => peer?.addTrack(track, local as MediaStream));
    },
    async createOffer() {
      if (!peer) throw new Error("The peer connection is not ready.");
      const offer = await peer.createOffer({});
      await peer.setLocalDescription(offer);
      return { type: "offer", sdp: offer.sdp ?? "" };
    },
    async createAnswer(offer) {
      if (!peer) throw new Error("The peer connection is not ready.");
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      remoteReady = true;
      await flushIce();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      return { type: "answer", sdp: answer.sdp ?? "" };
    },
    async applyAnswer(answer) {
      if (!peer) throw new Error("The peer connection is not ready.");
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
      remoteReady = true;
      await flushIce();
    },
    async addIceCandidate(candidate) {
      if (!peer || !remoteReady) {
        iceQueue.push(candidate);
        return;
      }
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    },
    setMuted(muted) {
      local?.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    },
    setCameraEnabled(enabled) {
      local?.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },
    async switchCamera() {
      local?.getVideoTracks().forEach((track) => {
        track._switchCamera();
      });
    },
    close() {
      closed = true;
      local?.getTracks().forEach((track) => track.stop());
      local = null;
      peer?.close();
      peer = null;
    },
  };
}
