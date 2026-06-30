import { setBaseUrl } from "@workspace/api-client-react";

export interface AppSettings {
  apiBaseUrl: string;
  refreshInterval: number;
}

const STORAGE_KEY = "iburuhwa:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: "",
  refreshInterval: 5000,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applySettings(settings);
}

export function applySettings(settings: AppSettings): void {
  setBaseUrl(settings.apiBaseUrl || null);
}

export function resetSettings(): AppSettings {
  localStorage.removeItem(STORAGE_KEY);
  applySettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}
