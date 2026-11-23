import type { TokenStore } from "@/services/token-store-types";

const ACCESS = "Saran.access";
const REFRESH = "Saran.refresh";

function memory(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Native builds use the Keychain / Keystore via expo-secure-store.
 * Browsers have no equivalent, so the web client keeps tokens in sessionStorage
 * for the life of the tab. Production web deployments should move refresh
 * tokens into httpOnly cookies.
 */
export function createTokenStore(): TokenStore {
  return {
    async getAccess() {
      return memory()?.getItem(ACCESS) ?? null;
    },
    async getRefresh() {
      return memory()?.getItem(REFRESH) ?? null;
    },
    async save(tokens) {
      memory()?.setItem(ACCESS, tokens.access);
      memory()?.setItem(REFRESH, tokens.refresh);
    },
    async clear() {
      memory()?.removeItem(ACCESS);
      memory()?.removeItem(REFRESH);
    },
  };
}
