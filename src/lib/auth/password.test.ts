import { describe, expect, it } from "vitest";
import { passwordChangeSchema, passwordMinimumLength } from "@/lib/auth/password";

describe("password change validation", () => {
  it("accepts a valid password change payload", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "password-demo",
      newPassword: "password-baru",
    });

    expect(parsed.success).toBe(true);
  });

  it("requires the current password", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "",
      newPassword: "password-baru",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.currentPassword).toContain("Password lama wajib diisi.");
    }
  });

  it("requires a minimum new password length", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "password-demo",
      newPassword: "short",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.newPassword).toContain(
        `Password baru minimal ${passwordMinimumLength} karakter.`,
      );
    }
  });

  it("rejects a new password that matches the old password", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: "password-demo",
      newPassword: "password-demo",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.newPassword).toContain(
        "Password baru harus berbeda dari password lama.",
      );
    }
  });
});
