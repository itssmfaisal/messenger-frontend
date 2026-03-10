// Simple storage helper that uses localStorage
// This works on both web and mobile (Capacitor WebView)

export async function setStorageItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    console.log(`[Storage] Set ${key}:`, value);
  } catch (e) {
    console.error(`[Storage] Failed to set ${key}:`, e);
  }
}

export async function getStorageItem(key: string): Promise<string | null> {
  try {
    const value = localStorage.getItem(key);
    console.log(`[Storage] Got ${key}:`, value);
    return value;
  } catch (e) {
    console.error(`[Storage] Failed to get ${key}:`, e);
    return null;
  }
}

export async function removeStorageItem(key: string) {
  try {
    localStorage.removeItem(key);
    console.log(`[Storage] Removed ${key}`);
  } catch (e) {
    console.error(`[Storage] Failed to remove ${key}:`, e);
  }
}
