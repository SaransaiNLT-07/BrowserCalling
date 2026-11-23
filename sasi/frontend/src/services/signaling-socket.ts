import { log } from "@/services/logger";
import type { ClientAction, ServerEvent } from "@/types/models";

export type SocketStatus = "idle" | "connecting" | "open" | "closed";

type SocketOptions = {
  url: string;
  getToken: () => Promise<string | null>;
  refreshToken: () => Promise<string | null>;
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: SocketStatus) => void;
};

export class SignalingSocket {
  private ws: WebSocket | null = null;
  private retry = 0;
  private shouldRun = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: SocketOptions) {}

  start() {
    this.shouldRun = true;
    void this.connect();
  }

  stop() {
    this.shouldRun = false;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.options.onStatus("idle");
  }

  send(action: ClientAction): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(action));
    return true;
  }

  private async connect() {
    if (!this.shouldRun) return;
    let token = await this.options.getToken();
    if (!token) {
      token = await this.options.refreshToken();
    }
    if (!token) {
      this.options.onStatus("closed");
      return;
    }

    this.options.onStatus("connecting");
    const joiner = this.options.url.includes("?") ? "&" : "?";
    const ws = new WebSocket(`${this.options.url}${joiner}token=${encodeURIComponent(token)}`);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this.options.onStatus("open");
      this.pingTimer = setInterval(() => {
        this.send({ action: "ping" });
      }, 20000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerEvent;
        if (message.type === "pong") return;
        this.options.onEvent(message);
      } catch (error) {
        log.error("signaling payload could not be read", error);
      }
    };

    ws.onerror = () => {
      log.warn("signaling socket error");
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.clearPing();
      this.options.onStatus("closed");
      if (!this.shouldRun) return;
      if (event.code === 4401) {
        void this.options.refreshToken().finally(() => this.schedule());
        return;
      }
      this.schedule();
    };
  }

  private schedule() {
    if (!this.shouldRun) return;
    const delay = Math.min(10000, 500 * 2 ** this.retry);
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private clearPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearPing();
  }
}
