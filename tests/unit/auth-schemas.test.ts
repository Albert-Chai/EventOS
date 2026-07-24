import { describe, expect, it } from "vitest";

import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";

describe("signUpSchema", () => {
  const valid = {
    email: "Organizer@EventOS.MY",
    password: "correct-horse",
    displayName: "  Aisyah Rahman  ",
  };

  it("normalises email to lowercase and trims the name", () => {
    const parsed = signUpSchema.parse(valid);
    expect(parsed.email).toBe("organizer@eventos.my");
    expect(parsed.displayName).toBe("Aisyah Rahman");
  });

  it("rejects a malformed email", () => {
    expect(signUpSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, email: "a@b" }).success).toBe(false);
  });

  it("enforces the minimum password length", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, password: "12345678" }).success).toBe(true);
  });

  it("caps password length at bcrypt's 72-byte limit", () => {
    // Beyond 72 bytes bcrypt silently truncates, so a longer password would
    // give a false sense of strength.
    expect(signUpSchema.safeParse({ ...valid, password: "a".repeat(73) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, password: "a".repeat(72) }).success).toBe(true);
  });

  it("rejects a name that is only whitespace", () => {
    expect(signUpSchema.safeParse({ ...valid, displayName: "   " }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("does not apply length rules to the sign-in password", () => {
    // Applying the sign-up policy here would tell an attacker that a stored
    // password fails current rules — and would lock out legacy accounts.
    const parsed = signInSchema.safeParse({ email: "a@b.test", password: "old" });
    expect(parsed.success).toBe(true);
  });

  it("still requires a non-empty password", () => {
    expect(signInSchema.safeParse({ email: "a@b.test", password: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires the confirmation to match", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "correct-horse", confirmPassword: "correct-horsé" })
        .success,
    ).toBe(false);
  });

  it("reports the mismatch on the confirmation field", () => {
    const result = resetPasswordSchema.safeParse({
      password: "correct-horse",
      confirmPassword: "nope-nope",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
    }
  });

  it("accepts a matching pair", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "correct-horse", confirmPassword: "correct-horse" })
        .success,
    ).toBe(true);
  });
});

describe("forgotPasswordSchema", () => {
  it("normalises the email so lookups are case-insensitive", () => {
    expect(forgotPasswordSchema.parse({ email: " Owner@Example.COM " }).email).toBe(
      "owner@example.com",
    );
  });
});
