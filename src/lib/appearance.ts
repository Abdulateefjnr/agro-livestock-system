export type AppearanceMode = "light" | "dark";

const SETTINGS_STORAGE_KEY = "agroliv-settings";

function getStoredPreferences(): Record<string, unknown> {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!stored) return {};

  try {
    const parsed: unknown = JSON.parse(stored);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

export function applyAppearance(appearance: AppearanceMode) {
  if (appearance === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function applySavedAppearance() {
  const { appearance } = getStoredPreferences();
  applyAppearance(appearance === "dark" ? "dark" : "light");
}

export function setSelectedAppearance(appearance: AppearanceMode) {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...getStoredPreferences(), appearance }),
  );
  applyAppearance(appearance);
}
