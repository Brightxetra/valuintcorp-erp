export type DeploymentEnvironment = Readonly<Record<string, string | undefined>>;

export const requiredProductionEnvironmentVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ERP_ATTACHMENTS_BUCKET",
  "CRON_SECRET",
] as const;

function envValue(environment: DeploymentEnvironment, name: string) {
  return environment[name]?.trim() ?? "";
}

export function isProductionDeployment(environment: DeploymentEnvironment = process.env) {
  const vercelEnvironment = envValue(environment, "VERCEL_ENV");
  const explicitEnvironment = envValue(environment, "VALUINTCORP_DEPLOYMENT_ENV");

  if (vercelEnvironment) {
    return vercelEnvironment === "production";
  }

  return (
    explicitEnvironment === "production" ||
    envValue(environment, "NODE_ENV") === "production"
  );
}

export function isProductionBuildE2ETestRuntime(
  environment: DeploymentEnvironment = process.env,
) {
  return (
    envValue(environment, "NODE_ENV") === "production" &&
    !envValue(environment, "VERCEL_ENV") &&
    envValue(environment, "VALUINTCORP_DEPLOYMENT_ENV") === "test" &&
    envValue(environment, "VALUINTCORP_E2E_DEMO_MODE") === "true"
  );
}

export function shouldEnforceProductionEnvironment(
  environment: DeploymentEnvironment = process.env,
) {
  return (
    envValue(environment, "VERCEL_ENV") === "production" ||
    envValue(environment, "VALUINTCORP_DEPLOYMENT_ENV") === "production"
  );
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

  if (envValue(environment, "NEXT_PUBLIC_DEMO_MODE") !== "false") {
    issues.push("NEXT_PUBLIC_DEMO_MODE must be explicitly set to false.");
  }

  if (envValue(environment, "NEXT_PUBLIC_VALUINTCORP_E2E_MODE") === "true") {
    issues.push("NEXT_PUBLIC_VALUINTCORP_E2E_MODE must not be enabled in production.");
  }

  if (envValue(environment, "VALUINTCORP_E2E_DEMO_MODE") === "true") {
    issues.push("VALUINTCORP_E2E_DEMO_MODE must not be enabled in production.");
  }

  const supabaseUrl = envValue(environment, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== "https:") {
        issues.push("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
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
  if (!isProductionDeployment(environment)) return;

  const issues = collectProductionEnvironmentIssues(environment);
  if (issues.length === 0) return;

  throw new Error(`${context} configuration is invalid:\n- ${issues.join("\n- ")}`);
}
