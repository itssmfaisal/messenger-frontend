"use client";

import { AuthProvider, useAuth } from "@/lib/client/auth-context";
import { ReactNode, useEffect } from "react";
import { initAndroidLogger } from "@/lib/android-logger";

// Initialize Android logger on first import
if (typeof window !== "undefined") {
  initAndroidLogger();
}

function AuthGuard({ children }: { children: ReactNode }) {
  const { isInitialized } = useAuth();

  console.log("[AuthGuard] Rendering, isInitialized:", isInitialized, "timestamp:", new Date().toISOString());

  // Block rendering until auth is fully initialized
  if (!isInitialized) {
    console.log("[AuthGuard] ⏳ BLOCKING - Showing spinner because isInitialized = false");
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  console.log("[AuthGuard] ✅ ALLOWING - isInitialized = true, rendering children");
  return <>{children}</>;
}

export default function AuthWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  );
}
