declare module "@capacitor/cli" {
  export type CapacitorConfig = {
    appId?: string;
    appName?: string;
    webDir?: string;
    server?: {
      url?: string;
      androidScheme?: string;
    };
  };
}
