import { AppShell } from "@/components/app-shell-new";
import { SettingsPremium } from "@/components/settings-premium";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <SettingsPremium initialWorkspace={workspace} />
    </AppShell>
  );
}
