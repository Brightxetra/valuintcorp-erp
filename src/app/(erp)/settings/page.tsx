import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { SettingsPremium } from "@/components/settings-premium";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await getInitialErpWorkspace({ profile: "settings" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <SettingsPremium initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
