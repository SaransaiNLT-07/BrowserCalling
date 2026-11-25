import type { IceServer } from "@/types/models";

function apiBase(value: string): string {
  return value.replace(/\/$/, "");
}

function socketBase(value: string): string {
  const [path, query] = value.split("?");
  const slashed = path.endsWith("/") ? path : `${path}/`;
  return query ? `${slashed}?${query}` : slashed;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  return apiBase(configured || "/api");
}

function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return socketBase(configured);
  if (typeof window === "undefined") return "/ws/signaling/";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/signaling/`;
}

export const env = {
  apiUrl: resolveApiUrl(),
  wsUrl: resolveWsUrl(),
  stunUrls: list(import.meta.env.VITE_STUN_URLS),
  turnUrl: import.meta.env.VITE_TURN_URL ?? "",
  turnUsername: import.meta.env.VITE_TURN_USERNAME ?? "",
  turnCredential: import.meta.env.VITE_TURN_CREDENTIAL ?? "",
};

export function iceServers(): IceServer[] {
  const servers: IceServer[] = env.stunUrls.map((urls) => ({ urls }));
  if (env.turnUrl) {
    servers.push({
      urls: env.turnUrl,
      username: env.turnUsername,
      credential: env.turnCredential,
    });
  }
  if (servers.length === 0) {
    servers.push({ urls: "stun:stun.l.google.com:19302" });
  }
  return servers;
}
