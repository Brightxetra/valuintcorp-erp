export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertProductionEnvironment } = await import("./lib/config/deployment-environment");
  assertProductionEnvironment(process.env, "Next.js server startup");
}
