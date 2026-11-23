import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiError } from "@/services/api-client";
import { getContainer } from "@/services/container";
import { runBeforeSignOut } from "@/services/session-bridge";
import type { MeUser, RegisterInput } from "@/types/models";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: MeUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<MeUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<MeUser | null>(null);

  useEffect(() => {
    let active = true;
    getContainer()
      .auth.loadSession()
      .then((session) => {
        if (!active) return;
        setUser(session);
        setStatus(session ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async signIn(email, password) {
        const next = await getContainer().auth.signIn(email, password);
        setUser(next);
        setStatus("authenticated");
      },
      async register(input) {
        const next = await getContainer().auth.register(input);
        setUser(next);
        setStatus("authenticated");
      },
      async signOut() {
        await runBeforeSignOut();
        await getContainer().auth.signOut();
        setUser(null);
        setStatus("anonymous");
      },
      async updateDisplayName(displayName) {
        const next = await getContainer().auth.updateDisplayName(displayName);
        setUser(next);
        return next;
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

export function messageFrom(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
