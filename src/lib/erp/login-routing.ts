const fallbackAuthenticatedPath = "/dashboard";
const onboardingPath = "/onboarding";

export function sanitizeLoginNextPath(nextPath: string | null | undefined) {
  if (!nextPath) return fallbackAuthenticatedPath;
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return fallbackAuthenticatedPath;
  if (nextPath === "/login" || nextPath.startsWith("/login?") || nextPath.startsWith("/login/")) {
    return fallbackAuthenticatedPath;
  }

  return nextPath;
}

export function destinationAfterLogin(nextPath: string | null | undefined, hasBusiness: boolean) {
  if (!hasBusiness) return onboardingPath;

  const safeNextPath = sanitizeLoginNextPath(nextPath);

  return safeNextPath === onboardingPath || safeNextPath.startsWith(`${onboardingPath}?`)
    ? fallbackAuthenticatedPath
    : safeNextPath;
}
