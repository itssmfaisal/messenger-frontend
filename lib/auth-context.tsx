"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface AuthContextType {
  token: string | null;
  username: string | null;
  setAuth: (token: string, username: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const savedToken = sessionStorage.getItem("token");
    const savedUsername = sessionStorage.getItem("username");
    if (savedToken && savedUsername) {
      setToken(savedToken);
      setUsername(savedUsername);
    }
    setLoaded(true);
  }, []);

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
