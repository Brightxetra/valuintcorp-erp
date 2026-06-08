import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(fileName) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const strict = process.env.VERIFY_DEPLOY_STRICT === "true";
const issues = [];
const warnings = [];

function requireEnv(name) {
  if (!process.env[name]) issues.push(`Missing env: ${name}`);
}

requireEnv("NEXT_PUBLIC_SUPABASE_URL");
requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
requireEnv("SUPABASE_ERP_ATTACHMENTS_BUCKET");
requireEnv("CRON_SECRET");

if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  issues.push("NEXT_PUBLIC_DEMO_MODE must be false for production deploy.");
}

if (process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== "true") {
  warnings.push("NEXT_PUBLIC_DEMO_LOGIN_ENABLED is not true; demo account bootstrap will be disabled.");
}

const requiredFiles = [
  "supabase/migrations/008_demo_sandbox_and_deploy_readiness.sql",
  "supabase/migrations/009_business_logo_profile.sql",
  "src/app/api/demo/bootstrap/route.ts",
  "src/app/api/ops/demo-reset/route.ts",
  "src/app/api/erp/business-logo/signed-upload/route.ts",
  "vercel.json",
];

for (const file of requiredFiles) {
  if (!existsSync(join(process.cwd(), file))) issues.push(`Missing file: ${file}`);
}

if (existsSync(join(process.cwd(), "vercel.json"))) {
  const vercelConfig = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  if (!vercelConfig.includes("/api/ops/demo-reset")) {
    issues.push("vercel.json must include cron path /api/ops/demo-reset.");
  }
}

if (issues.length === 0) {
  console.log("Deploy verification passed.");
} else {
  console.log("Deploy verification found issues:");
  for (const issue of issues) console.log(`- ${issue}`);
}

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (strict && issues.length > 0) {
  process.exit(1);
}
