let beforeSignOut: (() => Promise<void>) | null = null;

export function setBeforeSignOut(handler: (() => Promise<void>) | null) {
  beforeSignOut = handler;
}

export async function runBeforeSignOut() {
  if (beforeSignOut) await beforeSignOut();
}
