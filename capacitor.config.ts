import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.messenger.app",
  appName: "Messenger",
  webDir: "out",
  server: {
    // For development, point to your backend API
    // For production, remove or update this
    androidScheme: "https",
  },
};

export default config;
