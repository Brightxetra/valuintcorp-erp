"use client";

export const posLocationStorageKey = "valuintcorp.pos.locationId";
export const posReceiptSettingsStorageKey = "valuintcorp.pos.receiptSettings";

export type PosReceiptSettings = {
  paperWidth: "58" | "80";
  storeName: string;
  storeAddress: string;
  footer: string;
};

export const defaultPosReceiptSettings: PosReceiptSettings = {
  paperWidth: "80",
  storeName: "",
  storeAddress: "",
  footer: "Terima kasih atas kunjungan Anda.",
};

export function readStoredPosLocationId() {
  if (typeof window === "undefined") return "";

  return window.localStorage.getItem(posLocationStorageKey) ?? "";
}

export function writeStoredPosLocationId(locationId: string) {
  if (typeof window === "undefined") return;

  if (locationId) {
    window.localStorage.setItem(posLocationStorageKey, locationId);
  } else {
    window.localStorage.removeItem(posLocationStorageKey);
  }

  window.dispatchEvent(new CustomEvent("valuintcorp:pos-location-change", { detail: { locationId } }));
}

export function readStoredPosReceiptSettings(businessId: string): PosReceiptSettings {
  if (typeof window === "undefined") return defaultPosReceiptSettings;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${posReceiptSettingsStorageKey}.${businessId}`) ?? "null") as Partial<PosReceiptSettings> | null;
    return {
      ...defaultPosReceiptSettings,
      ...parsed,
      paperWidth: parsed?.paperWidth === "58" ? "58" : "80",
    };
  } catch {
    return defaultPosReceiptSettings;
  }
}

export function writeStoredPosReceiptSettings(businessId: string, settings: PosReceiptSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${posReceiptSettingsStorageKey}.${businessId}`, JSON.stringify(settings));
}
