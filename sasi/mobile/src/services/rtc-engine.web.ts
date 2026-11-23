import type { RtcEngine } from "@/services/rtc-engine.types";
import type { IceCandidateInit, IceServer, RtcStream, SessionDescription } from "@/types/models";

export function createRtcEngine(servers: IceServer[]): RtcEngine {
  let peer: RTCPeerConnection | null = null;
  let local: MediaStream | null = null;
  let closed = false;
  let remoteReady = false;
  let facing: "user" | "environment" = "user";
  const iceQueue: IceCandidateInit[] = [];

  const flushIce = async () => {
    const queued = iceQueue.splice(0, iceQueue.length);
    for (const candidate of queued) {
      if (!peer) return;
      await peer.addIceCandidate(candidate);
    }
  };

  return {
    async getUserMedia(video) {
      local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      return local as unknown as RtcStream;
    },
    createPeer(next) {
      peer = new RTCPeerConnection({ iceServers: servers });
      peer.onicecandidate = (event) => {
        if (!event.candidate?.candidate || closed) return;
        next.onIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      };
      peer.ontrack = (event) => {
        const remote = event.streams[0] ?? new MediaStream([event.track]);
        if (!closed) next.onRemoteStream(remote as unknown as RtcStream);
      };
      peer.onconnectionstatechange = () => {
        if (!closed && peer) next.onConnectionState(peer.connectionState);
      };
    },
    addLocalTracks() {
      if (!peer || !local) throw new Error("The peer connection is not ready.");
      local.getTracks().forEach((track) => peer?.addTrack(track, local as MediaStream));
    },
    async createOffer() {
      if (!peer) throw new Error("The peer connection is not ready.");
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      return { type: "offer", sdp: offer.sdp ?? "" };
    },
    async createAnswer(offer) {
      if (!peer) throw new Error("The peer connection is not ready.");
      await peer.setRemoteDescription(offer);
      remoteReady = true;
      await flushIce();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      return { type: "answer", sdp: answer.sdp ?? "" };
    },
    async applyAnswer(answer) {
      if (!peer) throw new Error("The peer connection is not ready.");
      await peer.setRemoteDescription(answer);
      remoteReady = true;
      await flushIce();
    },
    async addIceCandidate(candidate) {
      if (!peer || !remoteReady) {
        iceQueue.push(candidate);
        return;
      }
      await peer.addIceCandidate(candidate);
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
      if (!peer || !local) return;
      facing = facing === "user" ? "environment" : "user";
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      const track = next.getVideoTracks()[0];
      if (!track) return;
      const sender = peer.getSenders().find((item) => item.track?.kind === "video");
      await sender?.replaceTrack(track);
      local.getVideoTracks().forEach((existing) => {
        local?.removeTrack(existing);
        existing.stop();
      });
      local.addTrack(track);
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
