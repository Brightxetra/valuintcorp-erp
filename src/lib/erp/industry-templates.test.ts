import { describe, expect, it } from "vitest";
import {
  canonicalIndustryLabel,
  canonicalIndustryTemplateId,
  industryForTemplate,
} from "@/lib/erp/industry-templates";

describe("industry template compatibility", () => {
  it("maps legacy industry values to the two visible templates", () => {
    expect(canonicalIndustryTemplateId("food_beverage")).toBe("umkm");
    expect(canonicalIndustryTemplateId("retail")).toBe("general");
    expect(canonicalIndustryTemplateId("online_seller")).toBe("umkm");
    expect(canonicalIndustryTemplateId("service")).toBe("general");
    expect(canonicalIndustryTemplateId("manufacturing")).toBe("general");
    expect(canonicalIndustryTemplateId("general")).toBe("general");
  });

  it("keeps new business and template values canonical", () => {
    expect(industryForTemplate("umkm")).toBe("umkm");
    expect(industryForTemplate("general")).toBe("general");
    expect(canonicalIndustryLabel("online_seller")).toBe("UMKM");
  });
});
