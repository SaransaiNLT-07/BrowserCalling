import { iceServers } from "@/config/env";
import type { CallApi } from "@/services/call-api";
import { log } from "@/services/logger";
import { createRtcEngine, type RtcEngine } from "@/services/rtc-engine";
import type {
  Call,
  CallPhase,
  CallType,
  CallUiState,
  ClientAction,
  IceCandidateInit,
  IceServer,
  ServerEvent,
  SessionDescription,
} from "@/types/models";

const terminal = new Set(["rejected", "cancelled", "missed", "ended", "failed"]);

export const initialCallUi: CallUiState = {
  call: null,
  phase: "idle",
  localStream: null,
  remoteStream: null,
  muted: false,
  cameraEnabled: true,
  error: null,
  connectedAt: null,
};

type Send = (action: ClientAction) => boolean;

function isLive(phase: CallPhase) {
  return phase === "incoming" || phase === "outgoing" || phase === "connecting" || phase === "connected";
}

export class CallCoordinator {
  private state: CallUiState = initialCallUi;
  private readonly listeners = new Set<(state: CallUiState) => void>();
  private engine: RtcEngine | null = null;
  private send: Send = () => false;
  private generation = 0;
  private pendingOffer: SessionDescription | null = null;
  private earlyIce: IceCandidateInit[] = [];
  private offerSent = false;
  private answerSent = false;
  private mediaTask: Promise<void> | null = null;

  constructor(
    private readonly selfId: string,
    private readonly calls: CallApi,
  ) {}

  attachSend(send: Send) {
    this.send = send;
  }

  subscribe(listener: (state: CallUiState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot() {
    return this.state;
  }

  dispose() {
    this.generation += 1;
    this.closeMedia();
    this.state = initialCallUi;
    this.listeners.clear();
  }

  handle(event: ServerEvent) {
    if (event.type === "call.state") {
      void this.onCallState(event.call);
      return;
    }
    if (event.type === "call.offer") {
      void this.onOffer(event.call_id, event.sdp);
      return;
    }
    if (event.type === "call.answer") {
      void this.onAnswer(event.call_id, event.sdp);
      return;
    }
    if (event.type === "call.ice") {
      void this.onIce(event.call_id, event.candidate);
      return;
    }
    if (event.type === "call.negotiate") {
      void this.onNegotiate(event.call_id);
      return;
    }
    if (event.type === "error" && this.state.phase !== "ended" && event.code !== "invalid_state") {
      this.patch({ error: event.detail });
    }
  }

  async startOutgoing(calleeId: string, callType: CallType): Promise<Call> {
    if (isLive(this.state.phase)) {
      throw new Error("Finish the current call first.");
    }
    const call = await this.calls.create(calleeId, callType);
    this.patch({
      call,
      phase: "outgoing",
      error: null,
      connectedAt: null,
      muted: false,
      cameraEnabled: callType === "video",
      localStream: null,
      remoteStream: null,
    });
    return call;
  }

  async accept() {
    const call = this.requireCall();
    if (!call) return;
    if (!this.send({ action: "call.accept", call_id: call.id })) {
      await this.onCallState(await this.calls.accept(call.id));
    }
  }

  async decline() {
    const call = this.requireCall();
    if (!call) return;
    if (!this.send({ action: "call.reject", call_id: call.id })) {
      await this.onCallState(await this.calls.reject(call.id));
    }
  }

  async hangUp() {
    const call = this.state.call;
    if (!call || terminal.has(call.state)) {
      this.reset();
      return;
    }
    const action: ClientAction =
      call.state === "ringing" && call.caller.id === this.selfId
        ? { action: "call.cancel", call_id: call.id }
        : call.state === "ringing"
          ? { action: "call.reject", call_id: call.id }
          : { action: "call.end", call_id: call.id };
    if (!this.send(action)) {
      const updated =
        action.action === "call.cancel"
          ? await this.calls.cancel(call.id)
          : action.action === "call.reject"
            ? await this.calls.reject(call.id)
            : await this.calls.end(call.id);
      await this.onCallState(updated);
    }
  }

  toggleMute() {
    const muted = !this.state.muted;
    this.engine?.setMuted(muted);
    this.patch({ muted });
  }

  toggleCamera() {
    const cameraEnabled = !this.state.cameraEnabled;
    this.engine?.setCameraEnabled(cameraEnabled);
    this.patch({ cameraEnabled });
  }

  async switchCamera() {
    await this.engine?.switchCamera();
    if (this.state.localStream) this.patch({ localStream: this.state.localStream });
  }

  async restore(call: Call | null) {
    if (!call || terminal.has(call.state)) return;
    if (this.state.call?.id === call.id && isLive(this.state.phase)) return;
    await this.onCallState(call);
    if (call.state === "accepted" && call.callee.id === this.selfId && !this.engine) {
      this.send({ action: "call.negotiate", call_id: call.id });
    }
  }

  private requireCall() {
    return this.state.call;
  }

  private async onCallState(call: Call) {
    const mine = call.caller.id === this.selfId || call.callee.id === this.selfId;
    if (!mine) return;
    if (this.state.call && this.state.call.id !== call.id && isLive(this.state.phase)) return;

    if (terminal.has(call.state)) {
      this.generation += 1;
      this.closeMedia();
      this.patch({
        call,
        phase: "ended",
        localStream: null,
        remoteStream: null,
      });
      return;
    }

    if (call.state === "ringing") {
      this.patch({
        call,
        phase: call.callee.id === this.selfId ? "incoming" : "outgoing",
        error: null,
      });
      return;
    }

    if (call.state === "accepted") {
      const phase = this.state.phase === "connected" ? "connected" : "connecting";
      this.patch({ call, phase });
      if (call.caller.id === this.selfId) {
        await this.ensureOffer(call);
      } else {
        await this.answerPending(call);
      }
    }
  }

  private async onOffer(callId: string, sdp: SessionDescription) {
    if (this.state.call?.id !== callId) return;
    this.pendingOffer = sdp;
    if (this.state.call.state !== "accepted") return;
    if (this.answerSent) {
      this.answerSent = false;
      this.generation += 1;
      this.engine?.close();
      this.engine = null;
      this.patch({ localStream: null, remoteStream: null, phase: "connecting", connectedAt: null });
    }
    await this.answerPending(this.state.call);
  }

  private async onAnswer(callId: string, sdp: SessionDescription) {
    if (this.state.call?.id !== callId || !this.engine) return;
    await this.engine.applyAnswer(sdp);
  }

  private async onIce(callId: string, candidate: IceCandidateInit) {
    if (this.state.call?.id !== callId) return;
    if (!this.engine) {
      this.earlyIce.push(candidate);
      return;
    }
    await this.engine.addIceCandidate(candidate);
  }

  private async onNegotiate(callId: string) {
    const call = this.state.call;
    if (!call || call.id !== callId || call.caller.id !== this.selfId) return;
    this.offerSent = false;
    this.generation += 1;
    this.engine?.close();
    this.engine = null;
    this.patch({ localStream: null, remoteStream: null, phase: "connecting", connectedAt: null });
    await this.ensureOffer(call);
  }

  private async ensureOffer(call: Call) {
    await this.ensureMedia(call);
    if (!this.engine || this.offerSent) return;
    const offer = await this.engine.createOffer();
    this.offerSent = true;
    log.info("sending offer", { callId: call.id });
    if (!this.send({ action: "call.offer", call_id: call.id, sdp: offer })) {
      this.patch({ error: "The signaling connection dropped before the offer was sent." });
    }
  }

  private async answerPending(call: Call) {
    if (!this.pendingOffer || this.answerSent) {
      await this.ensureMedia(call);
      return;
    }
    await this.ensureMedia(call);
    if (!this.engine || !this.pendingOffer || this.answerSent) return;
    const offer = this.pendingOffer;
    this.answerSent = true;
    const answer = await this.engine.createAnswer(offer);
    log.info("sending answer", { callId: call.id });
    this.send({ action: "call.answer", call_id: call.id, sdp: answer });
  }

  private async ensureMedia(call: Call) {
    if (this.engine) return;
    if (this.mediaTask) return this.mediaTask;
    const generation = this.generation;
    this.mediaTask = this.openMedia(call, generation).finally(() => {
      this.mediaTask = null;
    });
    return this.mediaTask;
  }

  private async resolveIceServers(): Promise<IceServer[]> {
    try {
      const servers = await this.calls.iceServers();
      if (servers.length > 0) return servers;
    } catch (error) {
      log.warn("could not load TURN credentials, using local ICE config", { error });
    }
    return iceServers();
  }

  private async openMedia(call: Call, generation: number) {
    const servers = await this.resolveIceServers();
    if (generation !== this.generation) return;
    const engine = createRtcEngine(servers);
    try {
      const stream = await engine.getUserMedia(call.call_type === "video");
      if (generation !== this.generation) {
        engine.close();
        return;
      }
      engine.createPeer({
        onIceCandidate: (candidate) => {
          this.send({ action: "call.ice", call_id: call.id, candidate });
        },
        onRemoteStream: (remote) => this.patch({ remoteStream: remote }),
        onConnectionState: (connectionState) => {
          if (connectionState === "connected") {
            this.patch({
              phase: "connected",
              connectedAt: this.state.connectedAt ?? Date.now(),
              error: null,
            });
          }
          if (connectionState === "failed") void this.fail(call.id, "ice_failed");
        },
      });
      engine.addLocalTracks();
      for (const candidate of this.earlyIce) {
        await engine.addIceCandidate(candidate);
      }
      this.earlyIce = [];
      this.engine = engine;
      this.patch({
        localStream: stream,
        muted: false,
        cameraEnabled: call.call_type === "video",
      });
    } catch (error) {
      engine.close();
      log.error("media capture failed", error);
      if (generation === this.generation) {
        this.patch({ error: "Allow the microphone and camera to join this call." });
        await this.fail(call.id, "media_denied");
      }
    }
  }

  private async fail(callId: string, reason: "media_denied" | "ice_failed" | "connection_lost") {
    if (this.send({ action: "call.fail", call_id: callId, reason })) return;
    try {
      await this.onCallState(await this.calls.fail(callId, reason));
    } catch (error) {
      log.error("call failure was not recorded", error);
    }
  }

  private closeMedia() {
    this.engine?.close();
    this.engine = null;
    this.pendingOffer = null;
    this.earlyIce = [];
    this.offerSent = false;
    this.answerSent = false;
  }

  private reset() {
    this.generation += 1;
    this.closeMedia();
    this.patch(initialCallUi);
  }

  private patch(partial: Partial<CallUiState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }
}
