import { EmailAuthCallback } from "@/components/email-auth-callback";
import { LoginWorkspace } from "@/components/erp-workspaces";
import { getServerAccessToken, getServerAuthenticatedUser, getServerWorkspaceContext } from "@/lib/auth/server-session";
import { destinationAfterLogin } from "@/lib/erp/login-routing";
import { landingPathForPermissions, permissionsForRole } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    next?: string | string[];
  }>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function loginMode(value: string | string[] | undefined) {
  const mode = firstSearchParam(value);
  return mode === "register" || mode === "forgot" || mode === "magic" ? mode : "login";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = firstSearchParam(params.next);
  const accessToken = await getServerAccessToken();

  if (accessToken) {
    const context = await getServerWorkspaceContext();

    if (context) {
      const permissions = context.permissions ?? permissionsForRole(context.role);
      const defaultPath = landingPathForPermissions(permissions);
      return <EmailAuthCallback destination={destinationAfterLogin(nextPath, true, defaultPath)} />;
    }

    const user = await getServerAuthenticatedUser();

    if (user) {
      return <EmailAuthCallback destination={destinationAfterLogin(nextPath, false)} />;
    }
  }

  return <LoginWorkspace initialMode={loginMode(params.mode)} loginNextPath={nextPath ?? null} />;
}
