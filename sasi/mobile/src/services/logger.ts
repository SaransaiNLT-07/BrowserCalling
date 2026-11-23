export const log = {
  info(message: string, extra?: unknown) {
    if (__DEV__) console.info(`[Saran] ${message}`, extra ?? "");
  },
  warn(message: string, extra?: unknown) {
    console.warn(`[Saran] ${message}`, extra ?? "");
  },
  error(message: string, extra?: unknown) {
    console.error(`[Saran] ${message}`, extra ?? "");
  },
};
