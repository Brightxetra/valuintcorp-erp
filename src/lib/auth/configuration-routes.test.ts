import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as syncSession } from "@/app/api/auth/session/route";
import { GET as getSessionState } from "@/app/api/auth/session-state/route";
import { POST as touchSessionActivity } from "@/app/api/auth/session/activity/route";
import { POST as requestPasswordReset } from "@/app/api/auth/password/forgot/route";
import { POST as bootstrapDemoAccount } from "@/app/api/demo/bootstrap/route";

function expectConfigurationUnavailable(response: Response) {
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("auth route configuration boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VALUINTCORP_DEPLOYMENT_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 from session synchronization", async () => {
    const response = await syncSession(
      new Request("http://localhost/api/auth/session", { method: "POST" }),
    );
    expectConfigurationUnavailable(response);
  });

  it("returns 503 from session state", async () => {
    const response = await getSessionState(
      new Request("http://localhost/api/auth/session-state"),
    );
    expectConfigurationUnavailable(response);
  });

  it("returns 503 from session activity", async () => {
    const response = await touchSessionActivity(
      new Request("http://localhost/api/auth/session/activity", { method: "POST" }),
    );
    expectConfigurationUnavailable(response);
  });

  it("returns 503 from password recovery", async () => {
    const response = await requestPasswordReset(
      new Request("http://localhost/api/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "person@example.com" }),
      }),
    );
    expectConfigurationUnavailable(response);
  });

  it("returns 503 from hosted demo bootstrap", async () => {
    const response = await bootstrapDemoAccount(
      new Request("http://localhost/api/demo/bootstrap", { method: "POST" }),
    );
    expectConfigurationUnavailable(response);
  });
});
