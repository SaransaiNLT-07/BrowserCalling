import type { IceServer } from "@/types/models";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy mobile/.env.example to mobile/.env.`);
  }
  return value;
}

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

export const env = {
  apiUrl: apiBase(required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL)),
  wsUrl: socketBase(required("EXPO_PUBLIC_WS_URL", process.env.EXPO_PUBLIC_WS_URL)),
  stunUrls: list(process.env.EXPO_PUBLIC_STUN_URLS),
  turnUrl: process.env.EXPO_PUBLIC_TURN_URL ?? "",
  turnUsername: process.env.EXPO_PUBLIC_TURN_USERNAME ?? "",
  turnCredential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? "",
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
  return servers;
}
