"use client";
import React, { createContext, useContext, useState, ReactNode, useSyncExternalStore } from "react";

interface AuthContextType {
  token: string | null;
  username: string | null;
  setAuth: (token: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


function getLocalItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Sync state with localStorage on mount and when window regains focus
  React.useEffect(() => {
    function syncAuth() {
      setToken(getLocalItem("token"));
      setUsername(getLocalItem("username"));
    }
    syncAuth();
    window.addEventListener("focus", syncAuth);
    window.addEventListener("storage", syncAuth);
    return () => {
      window.removeEventListener("focus", syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, []);

  function setAuth(newToken: string, newUsername: string) {
    setToken(newToken);
    setUsername(newUsername);
    localStorage.setItem("token", newToken);
    localStorage.setItem("username", newUsername);
  }

  function logout() {
    setToken(null);
    setUsername(null);
    localStorage.removeItem("token");
    localStorage.removeItem("username");
  }

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
