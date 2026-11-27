const fallbackAuthenticatedPath = "/dashboard";
const onboardingPath = "/onboarding";
const loginRoutingOrigin = "https://navigation.valuintcorp.invalid";
const ambiguousNavigationPattern = /[\\\u0000-\u001f\u007f]|%(?:2f|5c)/i;

function isSamePathOrChild(path: string, parentPath: string) {
  return path === parentPath || path.startsWith(`${parentPath}?`) || path.startsWith(`${parentPath}/`);
}

export function sanitizeLoginNextPath(
  nextPath: string | null | undefined,
  fallbackPath = fallbackAuthenticatedPath,
) {
  if (!nextPath) return fallbackPath;
  if (
    !nextPath.startsWith("/") ||
    nextPath.startsWith("//") ||
    ambiguousNavigationPattern.test(nextPath)
  ) {
    return fallbackPath;
  }

  try {
    const destination = new URL(nextPath, loginRoutingOrigin);

    if (
      destination.origin !== loginRoutingOrigin ||
      destination.username ||
      destination.password
    ) {
      return fallbackPath;
    }

    if (
      destination.pathname === "/login" ||
      destination.pathname.startsWith("/login/")
    ) {
      return fallbackPath;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallbackPath;
  }
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
