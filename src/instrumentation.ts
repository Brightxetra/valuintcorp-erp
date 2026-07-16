export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertProductionEnvironment, shouldEnforceProductionEnvironment } = await import(
    "./lib/config/deployment-environment"
  );
  if (shouldEnforceProductionEnvironment(process.env)) {
    assertProductionEnvironment(process.env, "Next.js server startup");
  }
}
