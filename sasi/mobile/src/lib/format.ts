import type { Call, CallState } from "@/types/models";

export function otherParty(call: Call, selfId: string) {
  return call.caller.id === selfId ? call.callee : call.caller;
}

export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "?";
}

export function callLength(call: Call): string | null {
  if (!call.accepted_at || !call.ended_at) return null;
  return formatDuration(new Date(call.ended_at).getTime() - new Date(call.accepted_at).getTime());
}

export function directionLabel(call: Call, selfId: string): string {
  const direction = call.caller.id === selfId ? "Outgoing" : "Incoming";
  const kind = call.call_type === "video" ? "video" : "audio";
  return `${direction} ${kind}`;
}

export function stateLabel(state: CallState): string {
  switch (state) {
    case "ringing":
      return "Ringing";
    case "accepted":
      return "In progress";
    case "rejected":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "missed":
      return "Missed";
    case "ended":
      return "Ended";
    case "failed":
      return "Failed";
  }
}

export function endReasonCopy(call: Call, selfId: string): string {
  switch (call.state) {
    case "rejected":
      return call.callee.id === selfId ? "You declined the call." : "The call was declined.";
    case "cancelled":
      return call.caller.id === selfId ? "You cancelled the call." : "The caller cancelled.";
    case "missed":
      return "No one answered.";
    case "ended":
      return "The call ended.";
    case "failed":
      if (call.end_reason === "media_denied") return "Camera or microphone access was blocked.";
      if (call.end_reason === "connection_lost") return "The connection dropped.";
      if (call.end_reason === "ice_failed") return "The network could not connect the call.";
      return "The call failed.";
    default:
      return "";
  }
}

export function fieldMessage(fields: Record<string, unknown> | undefined, name: string): string | null {
  const value = fields?.[name];
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  if (typeof value === "string") return value;
  return null;
}
