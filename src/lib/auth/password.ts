import { z } from "zod";
import { passwordMinimumLength } from "@/lib/auth/password-policy";

export { passwordMinimumLength };

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Password lama wajib diisi." }),
    newPassword: z.string().min(passwordMinimumLength, { error: "Password baru minimal 8 karakter." }),
  })
  .superRefine((value, ctx) => {
    if (value.currentPassword && value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Password baru harus berbeda dari password lama.",
        path: ["newPassword"],
      });
    }
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
