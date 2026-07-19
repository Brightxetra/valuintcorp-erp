import {
  isSupabasePublicKey,
  isSupabaseServiceRoleKey,
} from "../supabase/config";

export type DeploymentEnvironment = Readonly<Record<string, string | undefined>>;

export const requiredProductionEnvironmentVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ERP_ATTACHMENTS_BUCKET",
  "CRON_SECRET",
] as const;

function envValue(environment: DeploymentEnvironment, name: string) {
  return environment[name]?.trim() ?? "";
}

const supabaseProjectRefPattern = /^[a-z0-9]{20}$/;

function isTrustedVercelNonProduction(environment: DeploymentEnvironment) {
  const vercelEnvironment = envValue(environment, "VERCEL_ENV");
  return (
    envValue(environment, "VERCEL") === "1" &&
    (vercelEnvironment === "preview" || vercelEnvironment === "development")
  );
}

function isTrustedVercelPreview(environment: DeploymentEnvironment) {
  return (
    envValue(environment, "VERCEL") === "1" &&
    envValue(environment, "VERCEL_ENV") === "preview"
  );
}

export function isProductionDeployment(environment: DeploymentEnvironment = process.env) {
  const vercelEnvironment = envValue(environment, "VERCEL_ENV");
  const explicitEnvironment = envValue(environment, "VALUINTCORP_DEPLOYMENT_ENV");

  return (
    vercelEnvironment === "production" ||
    explicitEnvironment === "production" ||
    (envValue(environment, "NODE_ENV") === "production" &&
      !isTrustedVercelNonProduction(environment))
  );
}

export function isProductionBuildE2ETestRuntime(
  environment: DeploymentEnvironment = process.env,
) {
  return (
    envValue(environment, "NODE_ENV") === "production" &&
    !envValue(environment, "VERCEL_ENV") &&
    !envValue(environment, "VERCEL") &&
    envValue(environment, "VALUINTCORP_DEPLOYMENT_ENV") === "test" &&
    envValue(environment, "NEXT_PUBLIC_DEMO_MODE") === "true" &&
    envValue(environment, "NEXT_PUBLIC_VALUINTCORP_E2E_MODE") === "true" &&
    envValue(environment, "VALUINTCORP_E2E_DEMO_MODE") === "true"
  );
}

export function shouldEnforceProductionEnvironment(
  environment: DeploymentEnvironment = process.env,
) {
  return (
    isProductionDeployment(environment) &&
    !isProductionBuildE2ETestRuntime(environment)
  );
}

function collectSupabaseKeyIssues(environment: DeploymentEnvironment) {
  const issues: string[] = [];
  const publicKey = envValue(environment, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = envValue(environment, "SUPABASE_SERVICE_ROLE_KEY");

  if (publicKey && serviceRoleKey && publicKey === serviceRoleKey) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY must not match SUPABASE_SERVICE_ROLE_KEY.");
  } else if (publicKey && !isSupabasePublicKey(publicKey)) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable key or legacy anon key.");
  }

  if (serviceRoleKey && !isSupabaseServiceRoleKey(serviceRoleKey)) {
    issues.push("SUPABASE_SERVICE_ROLE_KEY must be a secret key or legacy service_role key.");
  }

  return issues;
}

export function collectVercelDeploymentMarkerIssues(
  environment: DeploymentEnvironment = process.env,
) {
  if (!isTrustedVercelPreview(environment)) return [];

  const issues = collectSupabaseKeyIssues(environment);
  if (envValue(environment, "NEXT_PUBLIC_DEMO_MODE") === "true") {
    issues.push("NEXT_PUBLIC_DEMO_MODE must not be enabled on Vercel deployments.");
  }
  if (envValue(environment, "NEXT_PUBLIC_VALUINTCORP_E2E_MODE") === "true") {
    issues.push("NEXT_PUBLIC_VALUINTCORP_E2E_MODE must not be enabled on Vercel deployments.");
  }
  if (envValue(environment, "VALUINTCORP_E2E_DEMO_MODE") === "true") {
    issues.push("VALUINTCORP_E2E_DEMO_MODE must not be enabled on Vercel deployments.");
  }
  return issues;
}

export function collectProductionEnvironmentIssues(
  environment: DeploymentEnvironment = process.env,
) {
  const issues: string[] = [];

  for (const name of requiredProductionEnvironmentVariables) {
    if (!envValue(environment, name)) {
      issues.push(`Missing environment variable: ${name}.`);
    }
  }

  issues.push(...collectSupabaseKeyIssues(environment));

  if (envValue(environment, "NEXT_PUBLIC_DEMO_MODE") !== "false") {
    issues.push("NEXT_PUBLIC_DEMO_MODE must be explicitly set to false.");
  }

  if (envValue(environment, "NEXT_PUBLIC_VALUINTCORP_E2E_MODE") === "true") {
    issues.push("NEXT_PUBLIC_VALUINTCORP_E2E_MODE must not be enabled in production.");
  }

  if (envValue(environment, "VALUINTCORP_E2E_DEMO_MODE") === "true") {
    issues.push("VALUINTCORP_E2E_DEMO_MODE must not be enabled in production.");
  }

  const supabaseProjectRef = envValue(environment, "SUPABASE_PROJECT_REF");
  if (supabaseProjectRef && !supabaseProjectRefPattern.test(supabaseProjectRef)) {
    issues.push("SUPABASE_PROJECT_REF must be a 20-character lowercase project ref.");
  }

  const supabaseUrl = envValue(environment, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== "https:") {
        issues.push("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
      }
      if (
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      ) {
        issues.push(
          "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin without credentials, path, query, or hash.",
        );
      }
      if (
        supabaseProjectRefPattern.test(supabaseProjectRef) &&
        parsed.hostname.endsWith(".supabase.co") &&
        parsed.hostname !== `${supabaseProjectRef}.supabase.co`
      ) {
        issues.push("NEXT_PUBLIC_SUPABASE_URL does not match SUPABASE_PROJECT_REF.");
      }
    } catch {
      issues.push("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
    }
  }

  const attachmentsBucket = envValue(environment, "SUPABASE_ERP_ATTACHMENTS_BUCKET");
  if (attachmentsBucket && !/^[a-z0-9][a-z0-9._-]*$/i.test(attachmentsBucket)) {
    issues.push("SUPABASE_ERP_ATTACHMENTS_BUCKET has an invalid name.");
  }

  return issues;
}

export function assertProductionEnvironment(
  environment: DeploymentEnvironment = process.env,
  context = "Production runtime",
) {
  const issues = shouldEnforceProductionEnvironment(environment)
    ? collectProductionEnvironmentIssues(environment)
    : collectVercelDeploymentMarkerIssues(environment);
  if (issues.length === 0) return;

  throw new Error(`${context} configuration is invalid:\n- ${issues.join("\n- ")}`);
}
