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
