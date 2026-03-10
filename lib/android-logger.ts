/**
 * Android Logger Bridge
 * Sends console logs to Android logcat via Capacitor
 */

let isInitialized = false;

export function initAndroidLogger() {
  if (isInitialized) return;
  isInitialized = true;

  // Only run in browser/WebView environment
  if (typeof window === "undefined") return;

  // Check if we're in Capacitor environment
  const isCapacitor = (window as any).Capacitor !== undefined;

  if (isCapacitor) {
    const { log } = (window as any).Capacitor.Plugins;
    if (log) {
      // Override console.log to send to Android
      const originalLog = console.log;
      console.log = function (...args: any[]) {
        originalLog(...args);
        try {
          const message = args.map((arg) => String(arg)).join(" ");
          log.log({ level: "INFO", message });
        } catch (e) {}
      };

      const originalError = console.error;
      console.error = function (...args: any[]) {
        originalError(...args);
        try {
          const message = args.map((arg) => String(arg)).join(" ");
          log.log({ level: "ERROR", message });
        } catch (e) {}
      };

      const originalWarn = console.warn;
      console.warn = function (...args: any[]) {
        originalWarn(...args);
        try {
          const message = args.map((arg) => String(arg)).join(" ");
          log.log({ level: "WARN", message });
        } catch (e) {}
      };
    }
  }

  // Also try localStorage-based logging as fallback
  try {
    const logs: string[] = [];
    const maxLogs = 100;

    const addLog = (level: string, message: string) => {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level}] ${message}`;
      logs.push(logEntry);
      if (logs.length > maxLogs) logs.shift();
      localStorage.setItem("__app_logs", JSON.stringify(logs));
    };

    if (!isCapacitor) {
      const originalLog = console.log;
      console.log = function (...args: any[]) {
        originalLog(...args);
        try {
          const message = args.map((arg) => String(arg)).join(" ");
          addLog("INFO", message);
        } catch (e) {}
      };
    }
  } catch (e) {}
}

export function getLogs() {
  try {
    const logsJson = localStorage.getItem("__app_logs");
    return logsJson ? JSON.parse(logsJson) : [];
  } catch (e) {
    return [];
  }
}
