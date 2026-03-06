"use client";

import { createContext, useContext, useState, ReactNode, useSyncExternalStore } from "react";

interface AuthContextType {
  token: string | null;
  username: string | null;
  setAuth: (token: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getSessionItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(key);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getSessionItem("token"));
  const [username, setUsername] = useState<string | null>(() => getSessionItem("username"));
  const loaded = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  function setAuth(newToken: string, newUsername: string) {
    setToken(newToken);
    setUsername(newUsername);
    sessionStorage.setItem("token", newToken);
    sessionStorage.setItem("username", newUsername);
  }

  function logout() {
    setToken(null);
    setUsername(null);
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
  }

  if (!loaded) return null;

  return (
    <AuthContext.Provider value={{ token, username, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
