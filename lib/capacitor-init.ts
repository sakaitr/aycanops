"use client";

/**
 * capacitor-init.ts
 *
 * Capacitor plugin registration for native platforms.
 * Import this once in app/layout.tsx (or a root client component).
 * On web it is a safe no-op.
 */

export async function initCapacitor(): Promise<void> {
  if (typeof window === "undefined") return;

  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  try {
    // Register plugins only on native to avoid SSR issues
    const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
      import("@capacitor/app"),
      import("@capacitor/splash-screen"),
      import("@capacitor/status-bar"),
    ]);

    // Hide splash once page is ready
    await SplashScreen.hide({ fadeOutDuration: 300 });

    // Dark status bar
    await StatusBar.setStyle({ style: Style.Dark });

    // Handle back button on Android (prevent accidental exit)
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.minimizeApp();
      }
    });
  } catch (err) {
    // Not running in Capacitor — ignore
    console.debug("[Capacitor] init skipped:", err);
  }
}
