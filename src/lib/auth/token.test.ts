import { describe, expect, it } from "vitest";
import {
  accessTokenCookieMaxAge,
  isRecentSupabaseAuthentication,
  secondsUntilJwtExpiry,
  shouldRefreshAccessToken,
  verifiedSupabaseSessionIdentity,
} from "@/lib/auth/token";

function tokenWithClaims(claims: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");

  return `${header}.${payload}.signature`;
}

function tokenWithExpiry(exp: number) {
  return tokenWithClaims({ exp });
}

describe("auth token helpers", () => {
  it("reads JWT expiry from an access token", () => {
    const token = tokenWithExpiry(1_700_000_600);

    expect(secondsUntilJwtExpiry(token, 1_700_000_000)).toBe(600);
  });

  it("marks nearly expired tokens for refresh", () => {
    const token = tokenWithExpiry(1_700_000_060);

    expect(shouldRefreshAccessToken(token, 120)).toBe(true);
  });

  it("caps cookie max age to the JWT lifetime", () => {
    const token = tokenWithExpiry(1_700_000_300);

    expect(accessTokenCookieMaxAge(token, 3_600)).toBeLessThanOrEqual(300);
  });

  it("extracts only a verified user and UUID Supabase session binding", () => {
    const token = tokenWithClaims({
      sub: "11111111-1111-4111-8111-111111111111",
      session_id: "22222222-2222-4222-8222-222222222222",
      amr: [{ method: "password", timestamp: 1_700_000_000 }],
    });

    expect(
      verifiedSupabaseSessionIdentity(token, "11111111-1111-4111-8111-111111111111"),
    ).toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      authenticationMethod: "password",
      authenticatedAt: 1_700_000_000,
    });
    expect(
      verifiedSupabaseSessionIdentity(token, "33333333-3333-4333-8333-333333333333"),
    ).toBeNull();
    expect(
      verifiedSupabaseSessionIdentity(
        tokenWithClaims({ sub: "11111111-1111-4111-8111-111111111111" }),
        "11111111-1111-4111-8111-111111111111",
      ),
    ).toBeNull();
  });

  it("requires a recent real authentication and ignores token refresh AMR", () => {
    const identity = verifiedSupabaseSessionIdentity(
      tokenWithClaims({
        sub: "11111111-1111-4111-8111-111111111111",
        session_id: "22222222-2222-4222-8222-222222222222",
        amr: [
          { method: "password", timestamp: 1_700_000_000 },
          { method: "token_refresh", timestamp: 1_700_000_500 },
        ],
      }),
      "11111111-1111-4111-8111-111111111111",
    );

    expect(identity).not.toBeNull();
    expect(isRecentSupabaseAuthentication(identity!, 1_700_000_299)).toBe(true);
    expect(isRecentSupabaseAuthentication(identity!, 1_700_000_301)).toBe(false);
  });
});
