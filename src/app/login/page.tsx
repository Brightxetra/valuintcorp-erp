import { LoginWorkspace } from "@/components/erp-workspaces";
import { shouldUseDemoFallback } from "@/lib/auth/runtime";
import { getServerAuthenticatedUser, getServerWorkspaceContext } from "@/lib/auth/server-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) {
    return "/dashboard";
  }

  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[] }>;
}) {
  if (!shouldUseDemoFallback()) {
    const params = await searchParams;
    const authenticatedUser = await getServerAuthenticatedUser();

    if (authenticatedUser) {
      const context = await getServerWorkspaceContext();
      redirect(context ? safeNextPath(params?.next) : "/onboarding");
    }
  }

  return <LoginWorkspace />;
}
