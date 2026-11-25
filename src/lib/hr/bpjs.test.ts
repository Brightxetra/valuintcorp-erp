import { describe, expect, it } from "vitest";
import { calculateBpjsContribution, defaultBpjsPolicy } from "@/lib/hr/bpjs";

describe("employee BPJS participation", () => {
  it("calculates no contributions for employees outside BPJS", () => {
    const result = calculateBpjsContribution(10_000_000, defaultBpjsPolicy, "none");

    expect(result.totalEmployee).toBe(0);
    expect(result.totalEmployer).toBe(0);
  });

  it("limits health-only participation to health contributions", () => {
    const result = calculateBpjsContribution(10_000_000, defaultBpjsPolicy, "health");

    expect(result.kesehatanEmployee).toBeGreaterThan(0);
    expect(result.kesehatanEmployer).toBeGreaterThan(0);
    expect(result.jhtEmployee).toBe(0);
    expect(result.jpnEmployer).toBe(0);
    expect(result.jkk).toBe(0);
    expect(result.jkm).toBe(0);
  });

  it("limits employment-only participation to employment contributions", () => {
    const result = calculateBpjsContribution(10_000_000, defaultBpjsPolicy, "employment");

    expect(result.kesehatanEmployee).toBe(0);
    expect(result.jhtEmployee).toBeGreaterThan(0);
    expect(result.jpnEmployer).toBeGreaterThan(0);
    expect(result.jkk).toBeGreaterThan(0);
    expect(result.jkm).toBeGreaterThan(0);
  });
});
