"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SessionUser } from "lib/types";

interface SessionContextValue {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({
  user: initialUser,
  children,
}: {
  user: SessionUser | null;
  children: ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  // Synchronise l'état client si le serveur renvoie un nouvel utilisateur (ex: refresh après login)
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  return (
    <SessionContext.Provider value={{ user, setUser }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession doit être utilisé à l'intérieur d'un <SessionProvider>");
  }
  return ctx;
}
