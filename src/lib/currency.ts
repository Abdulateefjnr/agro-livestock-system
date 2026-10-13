import { useEffect, useState } from "react";

export type Currency = "NGN" | "USD";

export const CURRENCY_STORAGE_EVENT = "agroliv-currency-changed";
export const USD_TO_NGN_RATE = 1500;
const SETTINGS_STORAGE_KEY = "agroliv-settings";

export function getSelectedCurrency(): Currency {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!stored) return "NGN";

  try {
    const preferences = JSON.parse(stored) as { currency?: unknown };
    return preferences.currency === "USD" ? "USD" : "NGN";
  } catch {
    return "NGN";
  }
}

export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>(getSelectedCurrency);

  useEffect(() => {
    const refreshCurrency = () => setCurrency(getSelectedCurrency());
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) refreshCurrency();
    };

    window.addEventListener(CURRENCY_STORAGE_EVENT, refreshCurrency);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(CURRENCY_STORAGE_EVENT, refreshCurrency);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return currency;
}

export function setSelectedCurrency(currency: Currency) {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  let preferences: Record<string, unknown> = {};
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        preferences = parsed as Record<string, unknown>;
      }
    } catch {
      preferences = {};
    }
  }

  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...preferences, currency }),
  );
  window.dispatchEvent(new Event(CURRENCY_STORAGE_EVENT));
}

export function fromNaira(amount: number, currency: Currency) {
  return currency === "USD"
    ? Number((amount / USD_TO_NGN_RATE).toFixed(2))
    : amount;
}

export function toNaira(amount: number, currency: Currency) {
  return currency === "USD" ? amount * USD_TO_NGN_RATE : amount;
}

export function formatCurrency(amountInNaira: number, currency: Currency) {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "NGN" ? 0 : 2,
  }).format(fromNaira(amountInNaira, currency));
}

export function formatCurrencyInput(amountInNaira: number, currency: Currency) {
  const amount = fromNaira(amountInNaira, currency);
  return currency === "USD" ? amount.toFixed(2) : String(amount);
}
