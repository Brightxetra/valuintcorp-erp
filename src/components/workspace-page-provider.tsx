"use client";

import { ErpWorkspaceProvider } from "@/components/erp-context";
import type { PublicWorkspaceLoadProfile } from "@/lib/erp/workspace-profiles";
import type { ErpWorkspace } from "@/lib/erp/types";

export function WorkspacePageProvider({
  children,
  profile,
  workspace,
}: {
  children: React.ReactNode;
  profile: PublicWorkspaceLoadProfile;
  workspace: ErpWorkspace;
}) {
  return <ErpWorkspaceProvider initialWorkspace={workspace} profile={profile}>{children}</ErpWorkspaceProvider>;
}
