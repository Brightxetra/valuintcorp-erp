import { describe, expect, it } from "vitest";
import { accessTokenCookieMaxAge, secondsUntilJwtExpiry, shouldRefreshAccessToken } from "@/lib/auth/token";

function tokenWithExpiry(exp: number) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");

  return `${header}.${payload}.signature`;
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
});
