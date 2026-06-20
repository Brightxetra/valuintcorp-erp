"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FeedbackToast } from "@/components/feedback-toast";
import type { ErpWorkspace } from "@/lib/erp/types";
import {
  type BusinessOption,
  erpApiFetch,
  getStoredActiveBusinessId,
  loadBusinessOptions,
  loadWorkspaceForBusiness,
  shouldUseDemoFallbackBrowser,
  storeActiveBusinessId,
} from "@/lib/erp/client-api";

export type WorkspaceRuntimeMode = "demo_fallback" | "demo_account" | "production";

interface ErpContextValue {
  workspace: ErpWorkspace;
  setWorkspace: (workspace: ErpWorkspace) => void;
  businesses: BusinessOption[];
  activeBusinessId: string;
  setActiveBusinessId: (businessId: string) => void;
  loading: boolean;
  error: string | null;
  demoMode: boolean;
  demoAccount: boolean;
  runtimeMode: WorkspaceRuntimeMode;
  refreshWorkspace: () => Promise<void>;
  request: <T>(
    endpoint: string,
    options?: RequestInit & { businessId?: string | null },
  ) => Promise<T>;
}

const ErpContext = createContext<ErpContextValue | null>(null);

export function ErpWorkspaceProvider({
  autoRefresh = false,
  initialWorkspace,
  children,
}: {
  autoRefresh?: boolean;
  initialWorkspace: ErpWorkspace;
  children: React.ReactNode;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([
    {
      id: initialWorkspace.business.id,
      displayName: initialWorkspace.business.displayName,
      legalName: initialWorkspace.business.legalName,
      industry: initialWorkspace.business.industry,
      role: initialWorkspace.user.role,
    },
  ]);
  const [activeBusinessId, setActiveBusinessIdState] = useState(initialWorkspace.business.id);
  const demoMode = shouldUseDemoFallbackBrowser();
  const demoAccount = Boolean(workspace.demoSandbox);
  const runtimeMode: WorkspaceRuntimeMode = demoMode ? "demo_fallback" : demoAccount ? "demo_account" : "production";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setActiveBusinessId = useCallback((businessId: string) => {
    setActiveBusinessIdState(businessId);
    storeActiveBusinessId(businessId);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (demoMode) return;

    await Promise.resolve();
    setLoading(true);
    setError(null);

    try {
      const businessResult = await loadBusinessOptions();
      const nextBusinesses = businessResult.businesses;
      setBusinesses(nextBusinesses);

      const storedBusinessId = getStoredActiveBusinessId();
      const nextBusinessId =
        nextBusinesses.find((business) => business.id === storedBusinessId)?.id ??
        nextBusinesses[0]?.id ??
        businessResult.defaultBusinessId;

      if (!nextBusinessId) {
        setError("Belum ada bisnis aktif. Buat bisnis dari halaman onboarding/login terlebih dahulu.");
        return;
      }

      setActiveBusinessId(nextBusinessId);
      const workspaceResult = await loadWorkspaceForBusiness(nextBusinessId);
      setWorkspace(workspaceResult.workspace);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace production gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [demoMode, setActiveBusinessId]);

  useEffect(() => {
    if (!autoRefresh) return undefined;

    const timer = window.setTimeout(() => {
      void refreshWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [autoRefresh, refreshWorkspace]);

  useEffect(() => {
    if (demoMode || activeBusinessId === workspace.business.id) return;

    void (async () => {
      await Promise.resolve();
      setLoading(true);
      setError(null);

      try {
        const result = await loadWorkspaceForBusiness(activeBusinessId);
        setWorkspace(result.workspace);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Workspace gagal dimuat.");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeBusinessId, demoMode, workspace.business.id]);

  const request = useCallback(
    async <T,>(endpoint: string, options: RequestInit & { businessId?: string | null } = {}) =>
      erpApiFetch<T>(endpoint, {
        ...options,
        businessId: "businessId" in options ? options.businessId : activeBusinessId,
      }),
    [activeBusinessId],
  );

  const value = useMemo<ErpContextValue>(
    () => ({
      workspace,
      setWorkspace,
      businesses,
      activeBusinessId,
      setActiveBusinessId,
      loading,
      error,
      demoMode,
      demoAccount,
      runtimeMode,
      refreshWorkspace,
      request,
    }),
    [
      activeBusinessId,
      businesses,
      demoMode,
      demoAccount,
      error,
      loading,
      refreshWorkspace,
      runtimeMode,
      request,
      setActiveBusinessId,
      workspace,
    ],
  );

  return (
    <ErpContext.Provider value={value}>
      {children}
      <FeedbackToast error={error} />
    </ErpContext.Provider>
  );
}

export function useErpWorkspace(initialWorkspace?: ErpWorkspace) {
  const context = useContext(ErpContext);

  if (!context) {
    if (!initialWorkspace) {
      throw new Error("useErpWorkspace must be used inside ErpWorkspaceProvider.");
    }

    return {
      workspace: initialWorkspace,
      setWorkspace: () => undefined,
      businesses: [],
      activeBusinessId: initialWorkspace.business.id,
      setActiveBusinessId: () => undefined,
      loading: false,
      error: null,
      demoMode: true,
      demoAccount: false,
      runtimeMode: "demo_fallback",
      refreshWorkspace: async () => undefined,
      request: erpApiFetch,
    } satisfies ErpContextValue;
  }

  return context;
}
