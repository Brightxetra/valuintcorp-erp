import { AppShell } from "@/components/app-shell-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = await getInitialErpWorkspace({ profile: "shell" });

  return <AppShell workspace={workspace}>{children}</AppShell>;
}
