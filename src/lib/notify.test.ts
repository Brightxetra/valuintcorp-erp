import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
  update: vi.fn(),
}));

vi.mock("goey-toast", () => ({ gooeyToast: toast }));

import { notificationDurations, notify } from "@/lib/notify";

describe("notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the five-second default for successful and informational feedback", () => {
    notify.success("Profil bisnis disimpan", { description: "Industri: Jasa" });
    notify.info("Favorit diperbarui");

    expect(toast.success).toHaveBeenCalledWith("Profil bisnis disimpan", {
      description: "Industri: Jasa",
      duration: notificationDurations.success,
      showTimestamp: false,
    });
    expect(toast.info).toHaveBeenCalledWith("Favorit diperbarui", {
      duration: notificationDurations.success,
      showTimestamp: false,
    });
  });

  it("uses the eight-second default for errors", () => {
    notify.error("Operasi gagal", { description: "Industri tidak valid." });

    expect(toast.error).toHaveBeenCalledWith("Operasi gagal", {
      description: "Industri tidak valid.",
      duration: notificationDurations.error,
      showTimestamp: false,
    });
  });

  it("suppresses an identical notification emitted in the Strict Mode window", () => {
    const title = `Profil bisnis disimpan ${Date.now()}`;

    notify.success(title);
    notify.success(title);

    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("forwards async lifecycle labels to Goey promise notifications", () => {
    const operation = Promise.resolve({ id: "business-1" });
    const lifecycle = {
      loading: "Menyimpan profil bisnis...",
      success: "Profil bisnis disimpan",
      error: "Profil bisnis gagal disimpan",
    };

    notify.promise(operation, lifecycle);

    expect(toast.promise).toHaveBeenCalledWith(operation, { ...lifecycle, showTimestamp: false });
  });
  it("keeps timestamps hidden when an existing toast is updated", () => {
    notify.update("toast-1", { title: "Profil bisnis disimpan", showTimestamp: true });

    expect(toast.update).toHaveBeenCalledWith("toast-1", {
      title: "Profil bisnis disimpan",
      showTimestamp: false,
    });
  });
});
