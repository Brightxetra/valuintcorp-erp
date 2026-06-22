import { redirect } from "next/navigation";
import { LoginWorkspace } from "@/components/erp-workspaces";
import { getServerAccessToken, getServerAuthenticatedUser, getServerWorkspaceContext } from "@/lib/auth/server-session";
import { destinationAfterLogin } from "@/lib/erp/login-routing";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const accessToken = await getServerAccessToken();

  if (accessToken) {
    const [{ next }, context] = await Promise.all([searchParams, getServerWorkspaceContext()]);
    const nextPath = firstSearchParam(next);

    if (context) {
      redirect(destinationAfterLogin(nextPath, true));
    }

    const user = await getServerAuthenticatedUser();

    if (user) {
      redirect(destinationAfterLogin(nextPath, false));
    }
  }

  return <LoginWorkspace />;
}
