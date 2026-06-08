import { describe, expect, it } from "vitest";
import { assertBalanced } from "@/lib/accounting/engine";
import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import {
  buildFixedAssetDepreciationJournal,
  buildFixedAssetDisposalJournal,
  depreciationAmountForPeriod,
  disposalGainLoss,
  monthlyDepreciation,
} from "@/lib/erp/fixed-assets";
import {
  disposeFixedAsset,
  postFixedAssetDepreciationRun,
  reverseFixedAssetDocument,
  saveFixedAsset,
} from "@/lib/erp/posting";

describe("fixed asset engine", () => {
  it("calculates straight-line depreciation and prevents duplicate posted runs", () => {
    const workspace = createDemoErpWorkspace();
    const asset = workspace.fixedAssets[0];

    expect(monthlyDepreciation(asset)).toBe(600_000);
    expect(depreciationAmountForPeriod(asset, workspace.fixedAssetDepreciationLines)).toBe(600_000);

    const nextWorkspace = postFixedAssetDepreciationRun(workspace, {
      period: "2026-07",
      date: "2026-07-31",
    });

    expect(nextWorkspace.fixedAssetDepreciationRuns[0].period).toBe("2026-07");
    expect(nextWorkspace.fixedAssetDepreciationRuns[0].totalDepreciation).toBe(600_000);
    expect(() =>
      postFixedAssetDepreciationRun(nextWorkspace, {
        period: "2026-07",
        date: "2026-07-31",
      }),
    ).toThrow("sudah dipost");
  });

  it("builds balanced acquisition, depreciation, and disposal journals", () => {
    const workspace = createDemoErpWorkspace();
    const asset = workspace.fixedAssets[0];
    const depreciationJournal = buildFixedAssetDepreciationJournal({
      businessId: workspace.business.id,
      runId: "run-test",
      period: "2026-07",
      date: "2026-07-31",
      amount: monthlyDepreciation(asset),
    });
    const { bookValue, gainLoss } = disposalGainLoss({
      acquisitionCost: asset.acquisitionCost,
      accumulatedDepreciation: 1_200_000,
      proceeds: 20_000_000,
    });
    const disposalJournal = buildFixedAssetDisposalJournal({
      businessId: workspace.business.id,
      asset,
      accumulatedDepreciation: 1_200_000,
      disposal: {
        id: "disposal-test",
        date: "2026-08-01",
        proceeds: 20_000_000,
        bookValue,
        gainLoss,
        reason: "Jual aset",
      },
    });

    expect(() => assertBalanced(depreciationJournal.lines)).not.toThrow();
    expect(() => assertBalanced(disposalJournal.lines)).not.toThrow();
    expect(bookValue).toBe(22_800_000);
    expect(gainLoss).toBe(-2_800_000);
  });

  it("posts disposal and reversal through workspace state", () => {
    const workspace = createDemoErpWorkspace();
    const created = saveFixedAsset(workspace, {
      name: "Laptop kasir",
      category: "Peralatan kantor",
      acquisitionDate: "2026-06-10",
      acquisitionCost: 12_000_000,
      residualValue: 0,
      usefulLifeMonths: 24,
      depreciationMethod: "straight_line",
      acquisitionType: "cash",
    });
    const asset = created.fixedAssets[0];
    const disposed = disposeFixedAsset(created, {
      assetId: asset.id,
      date: "2026-06-20",
      proceeds: 10_000_000,
      reason: "Dijual",
    });
    const disposal = disposed.fixedAssetDisposals[0];
    const reversed = reverseFixedAssetDocument(disposed, {
      targetType: "disposal",
      targetId: disposal.id,
      date: "2026-06-21",
      reason: "Salah input",
    });

    expect(disposed.fixedAssets.find((item) => item.id === asset.id)?.status).toBe("disposed");
    expect(reversed.fixedAssetDisposals.find((item) => item.id === disposal.id)?.status).toBe("reversed");
    expect(reversed.fixedAssets.find((item) => item.id === asset.id)?.status).toBe("active");
  });
});
