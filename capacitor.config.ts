import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.messenger.app",
  appName: "Messenger",
  webDir: "out",
  server: {
    // Development: point to your local machine's dev server
    url: "http://192.168.1.100:3000",
    androidScheme: "https",
  },
};

export default config;
