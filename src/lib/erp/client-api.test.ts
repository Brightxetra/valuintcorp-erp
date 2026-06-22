import { describe, expect, it } from "vitest";
import { buildBrowserCookie } from "@/lib/erp/client-api";

describe("ERP client API auth helpers", () => {
  it("builds secure browser cookies for session cleanup", () => {
    expect(buildBrowserCookie("session", "token.value", 3600, true)).toBe(
      "session=token.value; Path=/; SameSite=Lax; Max-Age=3600; Secure",
    );
  });

  it("expires browser cookies with a non-negative max age", () => {
    expect(buildBrowserCookie("session", "", -1, false)).toBe(
      "session=; Path=/; SameSite=Lax; Max-Age=0",
    );
  });
});
