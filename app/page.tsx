"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/auth-context";

export default function Home() {
  const { token, isInitialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log("[Home] Auth state:", { token, isInitialized });
    if (!isInitialized) {
      console.log("[Home] Auth not initialized, waiting...");
      return;
    }
    console.log("[Home] Auth initialized. Token:", token ? "EXISTS" : "NULL");
    if (token) {
      console.log("[Home] Redirecting to /chat");
      router.replace("/chat");
    } else {
      console.log("[Home] Redirecting to /login");
      router.replace("/login");
    }
  }, [token, router, isInitialized]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  );
}
