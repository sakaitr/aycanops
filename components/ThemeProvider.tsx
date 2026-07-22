"use client";
import { useEffect } from "react";

const STORAGE_KEY = "aycan-theme";
const DEFAULT_THEME = "dusk-amber";
const CLOUD_THEMES = new Set(["cloud-blue","cloud-green","cloud-teal","cloud-amber","cloud-purple"]);

export function applyTheme(theme: string) {
  document.documentElement.setAttribute("data-theme", theme);
  if (CLOUD_THEMES.has(theme)) {
    document.documentElement.setAttribute("data-theme-mode", "light");
  } else {
    document.documentElement.removeAttribute("data-theme-mode");
  }
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
}

export function getStoredTheme(): string {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

export default function ThemeProvider() {
  useEffect(() => {
    const theme = getStoredTheme();
    document.documentElement.setAttribute("data-theme", theme);
    if (CLOUD_THEMES.has(theme)) {
      document.documentElement.setAttribute("data-theme-mode", "light");
    }
  }, []);
  return null;
}
