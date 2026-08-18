"use client";

import { createContext, useContext } from "react";
import type { SessionProfile } from "@/lib/auth/session";

const SessionContext = createContext<SessionProfile | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionProfile;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Client-side access to the current user's profile (role, status, name...). */
export function useSession(): SessionProfile {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
