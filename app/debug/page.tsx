"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DebugInfo {
  token: string | null;
  username: string | null;
  localStorage: Record<string, string>;
  timestamp: string;
  isInitialized: boolean;
}

export default function DebugPage() {
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      const username = localStorage.getItem("username");
      
      // Get all localStorage
      const allStorage: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          allStorage[key] = localStorage.getItem(key) || "";
        }
      }

      setInfo({
        token: token ? `${token.substring(0, 30)}...` : null,
        username,
        localStorage: allStorage,
        timestamp: new Date().toISOString(),
        isInitialized: token !== null,
      });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleClearStorage = () => {
    localStorage.clear();
    alert("Storage cleared!");
    handleRefresh();
  };

  const handleGoHome = () => {
    router.push("/");
  };

  if (!info) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">🔍 DEBUG PAGE</h1>
          <p className="text-red-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">🔍 DEBUG PAGE</h1>

        {error && (
          <div className="bg-red-800 p-4 rounded mb-4">
            <p className="font-bold text-red-200">ERROR:</p>
            <p className="text-red-100">{error}</p>
          </div>
        )}

        {/* Auth Status */}
        <div className="bg-gray-800 p-4 rounded mb-4 border-l-4 border-blue-500">
          <h2 className="text-xl font-bold mb-2">📱 Auth Status</h2>
          <div className="space-y-2 text-sm font-mono">
            <p>
              Token:{" "}
              <span className={info.token ? "text-green-400" : "text-red-400"}>
                {info.token ? "✅ " + info.token : "❌ NOT FOUND"}
              </span>
            </p>
            <p>
              Username:{" "}
              <span className={info.username ? "text-green-400" : "text-red-400"}>
                {info.username ? "✅ " + info.username : "❌ NOT FOUND"}
              </span>
            </p>
            <p>
              Initialized:{" "}
              <span className={info.isInitialized ? "text-green-400" : "text-red-400"}>
                {info.isInitialized ? "✅ YES" : "❌ NO"}
              </span>
            </p>
            <p className="text-gray-400">Last checked: {info.timestamp}</p>
          </div>
        </div>

        {/* localStorage Contents */}
        <div className="bg-gray-800 p-4 rounded mb-4 border-l-4 border-purple-500">
          <h2 className="text-xl font-bold mb-2">💾 localStorage Contents</h2>
          <div className="bg-gray-900 p-3 rounded text-xs font-mono max-h-64 overflow-auto">
            {Object.keys(info.localStorage).length === 0 ? (
              <p className="text-gray-400">Empty</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-yellow-400 w-1/3">Key</th>
                    <th className="text-left text-yellow-400">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(info.localStorage).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-700">
                      <td className="text-cyan-400 break-all">{key}</td>
                      <td className="text-green-400 break-all">
                        {value.length > 100
                          ? value.substring(0, 100) + "..."
                          : value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Status Indicator */}
        <div className="bg-gray-800 p-4 rounded mb-4 border-l-4 border-yellow-500">
          <h2 className="text-xl font-bold mb-2">🎯 Status</h2>
          <div className="text-lg">
            {info.token ? (
              <div className="text-green-400">
                ✅ <strong>USER IS LOGGED IN</strong>
                <p className="text-sm text-green-300 mt-1">
                  Token exists in localStorage. If you see this after a force-close, persistence is working!
                </p>
              </div>
            ) : (
              <div className="text-red-400">
                ❌ <strong>USER NOT LOGGED IN</strong>
                <p className="text-sm text-red-300 mt-1">
                  No token in localStorage. Either never logged in, or token was cleared.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-900 p-4 rounded mb-4">
          <h2 className="text-xl font-bold mb-2">📋 Test Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Go back home</li>
            <li>Login with your credentials</li>
            <li>Come back to this debug page</li>
            <li>You should see ✅ Token and username</li>
            <li>Force close the app completely (Settings → Apps → Force Stop)</li>
            <li>Reopen the app</li>
            <li>Come back to this debug page</li>
            <li>
              If token still shows ✅ = persistence works!
              <br />
              If token shows ❌ = persistence broken
            </li>
          </ol>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleGoHome}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold"
          >
            🏠 Go Home
          </button>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleClearStorage}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-bold"
          >
            🗑️ Clear Storage
          </button>
        </div>

        <p className="text-gray-400 text-xs mt-4">
          Debug Page • Timestamp: {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}
