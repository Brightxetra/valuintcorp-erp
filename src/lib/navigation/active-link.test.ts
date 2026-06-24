import { describe, expect, it } from "vitest";
import { getMostSpecificActiveHref, pathMatchesHref } from "@/lib/navigation/active-link";

describe("active navigation links", () => {
  it("chooses only the most specific matching route", () => {
    const hrefs = ["/karyawan", "/karyawan/gaji", "/karyawan/bpjs"];

    expect(getMostSpecificActiveHref("/karyawan/gaji", hrefs)).toBe("/karyawan/gaji");
    expect(getMostSpecificActiveHref("/karyawan/bpjs", hrefs)).toBe("/karyawan/bpjs");
    expect(getMostSpecificActiveHref("/karyawan", hrefs)).toBe("/karyawan");
  });

  it("keeps parent matching available for broad navigation", () => {
    expect(pathMatchesHref("/karyawan/gaji", "/karyawan")).toBe(true);
    expect(pathMatchesHref("/karyawan", "/karyawan/gaji")).toBe(false);
  });
});
