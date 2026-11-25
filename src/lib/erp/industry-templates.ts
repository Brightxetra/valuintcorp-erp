export type CanonicalIndustryTemplateId = "umkm" | "general";

export function canonicalIndustryTemplateId(value: string): CanonicalIndustryTemplateId {
  return ["food_beverage", "online_seller", "tpl-food-beverage-recipe", "umkm"].includes(value) ? "umkm" : "general";
}

export function industryForTemplate(value: string): CanonicalIndustryTemplateId {
  return canonicalIndustryTemplateId(value);
}

export function canonicalIndustryLabel(value: string) {
  return canonicalIndustryTemplateId(value) === "general" ? "General" : "UMKM";
}
