import { env } from "@/config/env";
import { ApiClient } from "@/services/api-client";
import { AuthService } from "@/services/auth-service";
import { CallApi } from "@/services/call-api";
import { DirectoryService } from "@/services/directory-service";
import { createTokenStore, type TokenStore } from "@/services/token-store";

export type AppContainer = {
  tokens: TokenStore;
  api: ApiClient;
  auth: AuthService;
  directory: DirectoryService;
  calls: CallApi;
};

let container: AppContainer | null = null;

export function getContainer(): AppContainer {
  if (!container) {
    const tokens = createTokenStore();
    const api = new ApiClient(env.apiUrl, tokens);
    const auth = new AuthService(api, tokens);
    api.setRefresh(() => auth.refreshAccess());
    container = {
      tokens,
      api,
      auth,
      directory: new DirectoryService(api),
      calls: new CallApi(api),
    };
  }
  return container;
}
