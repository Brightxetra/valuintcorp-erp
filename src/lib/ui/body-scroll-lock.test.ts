import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireBodyScrollLock } from "@/lib/ui/body-scroll-lock";

describe("body scroll lock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the body locked until every owner releases it", () => {
    const body = { style: { overflow: "auto" } };
    vi.stubGlobal("document", { body });

    const releaseDialog = acquireBodyScrollLock();
    const releaseSidebar = acquireBodyScrollLock();

    expect(body.style.overflow).toBe("hidden");
    releaseDialog();
    expect(body.style.overflow).toBe("hidden");
    releaseSidebar();
    expect(body.style.overflow).toBe("auto");
  });

  it("restores the original overflow and ignores duplicate cleanup", () => {
    const body = { style: { overflow: "clip" } };
    vi.stubGlobal("document", { body });

    const release = acquireBodyScrollLock();
    release();
    release();

    expect(body.style.overflow).toBe("clip");
  });
});
