import type { ApiClient } from "@/services/api-client";
import { log } from "@/services/logger";
import type { TokenStore } from "@/services/token-store";
import type { MeUser, RegisterInput, SessionResponse } from "@/types/models";

export class AuthService {
  constructor(
    private readonly api: ApiClient,
    private readonly tokens: TokenStore,
  ) {}

  async register(input: RegisterInput): Promise<MeUser> {
    const session = await this.api.request<SessionResponse>("/auth/register/", {
      method: "POST",
      auth: false,
      body: JSON.stringify(input),
    });
    await this.tokens.save({ access: session.access, refresh: session.refresh });
    return session.user;
  }

  async signIn(email: string, password: string): Promise<MeUser> {
    const session = await this.api.request<SessionResponse>("/auth/token/", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    await this.tokens.save({ access: session.access, refresh: session.refresh });
    return session.user;
  }

  async refreshAccess(): Promise<string | null> {
    const refresh = await this.tokens.getRefresh();
    if (!refresh) return null;
    try {
      const data = await this.api.request<{ access: string; refresh?: string }>("/auth/token/refresh/", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ refresh }),
      });
      await this.tokens.save({ access: data.access, refresh: data.refresh ?? refresh });
      return data.access;
    } catch (error) {
      log.warn("token refresh failed", error);
      await this.tokens.clear();
      return null;
    }
  }

  async loadSession(): Promise<MeUser | null> {
    const refresh = await this.tokens.getRefresh();
    if (!refresh) return null;
    const access = await this.refreshAccess();
    if (!access) return null;
    try {
      return await this.api.request<MeUser>("/auth/me/");
    } catch (error) {
      log.warn("session restore failed", error);
      await this.tokens.clear();
      return null;
    }
  }

  async updateDisplayName(displayName: string): Promise<MeUser> {
    return this.api.request<MeUser>("/auth/me/", {
      method: "PATCH",
      body: JSON.stringify({ display_name: displayName }),
    });
  }

  async signOut(): Promise<void> {
    const refresh = await this.tokens.getRefresh();
    try {
      if (refresh) {
        await this.api.request<void>("/auth/logout/", {
          method: "POST",
          body: JSON.stringify({ refresh }),
        });
      }
    } catch (error) {
      log.warn("logout request failed", error);
    } finally {
      await this.tokens.clear();
    }
  }
}
