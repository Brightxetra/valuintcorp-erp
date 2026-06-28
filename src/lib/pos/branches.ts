import type { ErpWorkspace } from "@/lib/erp/types";

export type PosBranch = ErpWorkspace["locations"][number];

const posLocationTypes = new Set(["branch", "outlet", "store"]);

export function getAccessiblePosBranches(workspace: ErpWorkspace): PosBranch[] {
  const fullBranchAccess = workspace.user.role === "owner" || workspace.user.role === "system_admin";
  const assignedLocations = new Set(workspace.assignedLocationIds ?? []);

  return workspace.locations.filter((location) => {
    const isPosLocation = posLocationTypes.has(location.type) && Boolean(location.warehouseId);
    if (!isPosLocation) return false;
    return fullBranchAccess || assignedLocations.size === 0 || assignedLocations.has(location.id);
  });
}
