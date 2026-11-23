import * as SecureStore from "expo-secure-store";

import type { TokenStore } from "@/services/token-store-types";

const ACCESS = "Saran.access";
const REFRESH = "Saran.refresh";

export function createTokenStore(): TokenStore {
  return {
    getAccess: () => SecureStore.getItemAsync(ACCESS),
    getRefresh: () => SecureStore.getItemAsync(REFRESH),
    async save(tokens) {
      await SecureStore.setItemAsync(ACCESS, tokens.access);
      await SecureStore.setItemAsync(REFRESH, tokens.refresh);
    },
    async clear() {
      await SecureStore.deleteItemAsync(ACCESS).catch(() => undefined);
      await SecureStore.deleteItemAsync(REFRESH).catch(() => undefined);
    },
  };
}
