"use client";

import { ErpWorkspaceProvider } from "@/components/erp-context";
import type { ErpWorkspace } from "@/lib/erp/types";

export function WorkspacePageProvider({
  children,
  workspace,
}: {
  children: React.ReactNode;
  workspace: ErpWorkspace;
}) {
  return <ErpWorkspaceProvider initialWorkspace={workspace}>{children}</ErpWorkspaceProvider>;
}
