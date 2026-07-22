import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "digital.agno.aycanops",
  appName: "Aycan OPS",
  webDir: "out", // next build --output=export → out/
  // Server config: dev'de web proxy, production'da boş bırak (bundled assets)
  server: process.env.CAPACITOR_SERVER_URL
    ? { url: process.env.CAPACITOR_SERVER_URL, cleartext: true }
    : undefined,
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#09090b", // zinc-950
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#09090b",
    },
  },
  android: {
    allowMixedContent: false,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    contentInset: "automatic",
    scheme: "AycanOPS",
    backgroundColor: "#09090b",
  },
};

export default config;
