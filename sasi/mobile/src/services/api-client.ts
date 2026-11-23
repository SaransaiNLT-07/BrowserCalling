import { log } from "@/services/logger";
import type { TokenStore } from "@/services/token-store-types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, unknown>;

  constructor(message: string, status: number, code: string, fields?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type RequestOptions = RequestInit & { auth?: boolean };

export class ApiClient {
  private refresh: () => Promise<string | null> = async () => null;
  private refreshing: Promise<string | null> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly tokens: TokenStore,
  ) {}

  setRefresh(refresh: () => Promise<string | null>) {
    this.refresh = refresh;
  }

  async request<T>(path: string, options: RequestOptions = {}, allowRetry = true): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (options.auth !== false) {
      const access = await this.tokens.getAccess();
      if (access) headers.set("Authorization", `Bearer ${access}`);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    } catch (error) {
      log.warn("network request failed", error);
      throw new ApiError("The server could not be reached.", 0, "network");
    }

    if (response.status === 401 && options.auth !== false && allowRetry) {
      const next = await this.refreshOnce();
      if (next) return this.request<T>(path, options, false);
    }

    if (response.status === 204) return undefined as T;

    const payload = (await response.json().catch(() => null)) as
      | { detail?: string; code?: string; fields?: Record<string, unknown> }
      | null;

    if (!response.ok) {
      throw new ApiError(
        payload?.detail ?? "The request failed.",
        response.status,
        payload?.code ?? "error",
        payload?.fields,
      );
    }
    return payload as T;
  }

  private refreshOnce() {
    if (!this.refreshing) {
      this.refreshing = this.refresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }
}
