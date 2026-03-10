"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";
import { setStorageItem, getStorageItem, removeStorageItem } from "../capacitor-storage";

interface AuthContextType {
  token: string | null;
  username: string | null;
  setAuth: (token: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  isInitialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  React.useEffect(() => {
    async function syncAuth() {
      console.log("[AuthContext] ⏳ Starting sync...", { timestamp: new Date().toISOString() });
      try {
        const t = await getStorageItem("token");
        const u = await getStorageItem("username");
        console.log("[AuthContext] 📦 Loaded from storage:", { 
          token: t ? `${t.substring(0, 20)}...` : null, 
          username: u,
          timestamp: new Date().toISOString()
        });
        setToken(t);
        setUsername(u);
        
        // Verify what we loaded
        const verifyToken = localStorage.getItem("token");
        const verifyUsername = localStorage.getItem("username");
        console.log("[AuthContext] 🔍 Verification - values in localStorage:", { 
          tokenExists: !!verifyToken, 
          usernameExists: !!verifyUsername 
        });
      } catch (error) {
        console.error("[AuthContext] ❌ Failed to sync from storage:", error);
      } finally {
        // Mark as initialized after attempting to load
        setIsInitialized(true);
        console.log("[AuthContext] ✅ Sync complete, isInitialized = true");
      }
    }
    syncAuth();
  }, []);

  function setAuthSync(newToken: string, newUsername: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("[AuthContext] setAuthSync called with:", { 
        newToken: `${newToken.substring(0, 20)}...`, 
        newUsername,
        timestamp: new Date().toISOString()
      });
      
      // Update state immediately
      setToken(newToken);
      setUsername(newUsername);
      console.log("[AuthContext] State updated immediately");
      
      // Save to storage and complete promise when done
      (async () => {
        try {
          await setStorageItem("token", newToken);
          console.log("[AuthContext] ✅ Token saved to localStorage");
          
          await setStorageItem("username", newUsername);
          console.log("[AuthContext] ✅ Username saved to localStorage");
          
          // Verify persistence
          const checkToken = localStorage.getItem("token");
          const checkUsername = localStorage.getItem("username");
          console.log("[AuthContext] 🔍 Verification after save:", { 
            tokenSaved: checkToken ? `${checkToken.substring(0, 20)}...` : null,
            usernameSaved: checkUsername,
            tokenMatches: checkToken === newToken,
            usernameMatches: checkUsername === newUsername
          });
          
          resolve(); // Complete successfully
        } catch (error) {
          console.error("[AuthContext] ❌ Failed to save to storage:", error);
          reject(error);
        }
      })();
    });
  }

  function logoutSync(): Promise<void> {
    return new Promise((resolve) => {
      setToken(null);
      setUsername(null);
      
      (async () => {
        try {
          await removeStorageItem("token");
          console.log("[AuthContext] ✅ Removed token from storage");
          
          await removeStorageItem("username");
          console.log("[AuthContext] ✅ Removed username from storage");
          
          resolve();
        } catch (error) {
          console.error("[AuthContext] ❌ Failed to remove from storage:", error);
          resolve(); // Still resolve on error to not block app
        }
      })();
    });
  }

  return (
    <AuthContext.Provider value={{ token, username, setAuth: setAuthSync, logout: logoutSync, isInitialized }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
