import type { ApiClient } from "@/services/api-client";
import type { Call, CallType, Page } from "@/types/models";

export class CallApi {
  constructor(private readonly api: ApiClient) {}

  create(calleeId: string, callType: CallType): Promise<Call> {
    return this.api.request<Call>("/calls/", {
      method: "POST",
      body: JSON.stringify({ callee_id: calleeId, call_type: callType }),
    });
  }

  list(active = false): Promise<Page<Call>> {
    const params = new URLSearchParams({ page_size: "30" });
    if (active) params.set("active", "true");
    return this.api.request<Page<Call>>(`/calls/?${params.toString()}`);
  }

  retrieve(callId: string): Promise<Call> {
    return this.api.request<Call>(`/calls/${callId}/`);
  }

  accept(callId: string): Promise<Call> {
    return this.api.request<Call>(`/calls/${callId}/accept/`, { method: "POST" });
  }

  reject(callId: string): Promise<Call> {
    return this.api.request<Call>(`/calls/${callId}/reject/`, { method: "POST" });
  }

  cancel(callId: string): Promise<Call> {
    return this.api.request<Call>(`/calls/${callId}/cancel/`, { method: "POST" });
  }

  end(callId: string): Promise<Call> {
    return this.api.request<Call>(`/calls/${callId}/end/`, { method: "POST" });
  }

  fail(callId: string, reason: "media_denied" | "ice_failed" | "connection_lost"): Promise<Call> {
    return this.api.request<Call>(`/calls/${callId}/fail/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }
}
