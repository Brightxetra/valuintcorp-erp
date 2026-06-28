"use client";

export const posLocationStorageKey = "valuintcorp.pos.locationId";

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
