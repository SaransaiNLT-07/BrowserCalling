export type TokenPair = {
  access: string;
  refresh: string;
};

export type TokenStore = {
  getAccess: () => Promise<string | null>;
  getRefresh: () => Promise<string | null>;
  save: (tokens: TokenPair) => Promise<void>;
  clear: () => Promise<void>;
};

const ACCESS = "Saran.access";
const REFRESH = "Saran.refresh";

function memory(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

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
