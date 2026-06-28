const fallbackAuthenticatedPath = "/dashboard";
const onboardingPath = "/onboarding";

function isSamePathOrChild(path: string, parentPath: string) {
  return path === parentPath || path.startsWith(`${parentPath}?`) || path.startsWith(`${parentPath}/`);
}

export function sanitizeLoginNextPath(
  nextPath: string | null | undefined,
  fallbackPath = fallbackAuthenticatedPath,
) {
  if (!nextPath) return fallbackPath;
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return fallbackPath;
  if (nextPath === "/login" || nextPath.startsWith("/login?") || nextPath.startsWith("/login/")) {
    return fallbackPath;
  }

  return nextPath;
}

export function destinationAfterLogin(
  nextPath: string | null | undefined,
  hasBusiness: boolean,
  defaultAuthenticatedPath = fallbackAuthenticatedPath,
) {
  if (!hasBusiness) return onboardingPath;

  const fallbackPath = sanitizeLoginNextPath(defaultAuthenticatedPath);
  const safeNextPath = sanitizeLoginNextPath(nextPath, fallbackPath);

  if (safeNextPath === onboardingPath || safeNextPath.startsWith(`${onboardingPath}?`)) {
    return fallbackPath;
  }

  if (fallbackPath !== fallbackAuthenticatedPath && !isSamePathOrChild(safeNextPath, fallbackPath)) {
    return fallbackPath;
  }

  return safeNextPath;
}
