import { accountCodes, systemAccounts } from "@/lib/accounting/chart";
import { createJournalEntry, makeLine } from "@/lib/accounting/engine";
import type { JournalEntry, JournalLine, Money } from "@/lib/domain/types";
import type {
  FixedAsset,
  FixedAssetAcquisitionType,
  FixedAssetDepreciationLine,
  FixedAssetDisposal,
} from "@/lib/erp/types";

export function accumulatedDepreciationForAsset(
  assetId: string,
  depreciationLines: FixedAssetDepreciationLine[],
): Money {
  return depreciationLines
    .filter((line) => line.assetId === assetId)
    .reduce((total, line) => total + line.amount, 0);
}

export function depreciableBase(asset: Pick<FixedAsset, "acquisitionCost" | "residualValue">): Money {
  return Math.max(asset.acquisitionCost - asset.residualValue, 0);
}

export function monthlyDepreciation(asset: Pick<FixedAsset, "acquisitionCost" | "residualValue" | "usefulLifeMonths">): Money {
  if (asset.usefulLifeMonths <= 0) return 0;
  return Math.round(depreciableBase(asset) / asset.usefulLifeMonths);
}

export function bookValueForAsset(
  asset: Pick<FixedAsset, "id" | "acquisitionCost">,
  depreciationLines: FixedAssetDepreciationLine[],
): Money {
  return Math.max(asset.acquisitionCost - accumulatedDepreciationForAsset(asset.id, depreciationLines), 0);
}

export function depreciationAmountForPeriod(
  asset: Pick<FixedAsset, "id" | "acquisitionCost" | "residualValue" | "usefulLifeMonths">,
  depreciationLines: FixedAssetDepreciationLine[],
): Money {
  const accumulated = accumulatedDepreciationForAsset(asset.id, depreciationLines);
  const remaining = Math.max(depreciableBase(asset) - accumulated, 0);

  return Math.min(monthlyDepreciation(asset), remaining);
}

export function buildFixedAssetAcquisitionJournal(params: {
  businessId: string;
  assetId: string;
  assetNo: string;
  date: string;
  amount: Money;
  acquisitionType: Exclude<FixedAssetAcquisitionType, "opening_balance">;
}): JournalEntry {
  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: `Perolehan aset tetap ${params.assetNo}`,
    source: "fixed_asset",
    referenceId: params.assetId,
    lines: [
      makeLine(systemAccounts, accountCodes.fixedAssets, "debit", params.amount, params.assetNo),
      makeLine(
        systemAccounts,
        params.acquisitionType === "cash" ? accountCodes.cash : accountCodes.accountsPayable,
        "credit",
        params.amount,
        params.assetNo,
      ),
    ],
    accounts: systemAccounts,
  });
}

export function buildFixedAssetDepreciationJournal(params: {
  businessId: string;
  runId: string;
  period: string;
  date: string;
  amount: Money;
}): JournalEntry {
  return createJournalEntry({
    businessId: params.businessId,
    date: params.date,
    description: `Penyusutan aset tetap ${params.period}`,
    source: "fixed_asset",
    referenceId: params.runId,
    lines: [
      makeLine(systemAccounts, accountCodes.depreciationExpense, "debit", params.amount, params.period),
      makeLine(systemAccounts, accountCodes.accumulatedDepreciation, "credit", params.amount, params.period),
    ],
    accounts: systemAccounts,
  });
}

export function disposalGainLoss(params: {
  acquisitionCost: Money;
  accumulatedDepreciation: Money;
  proceeds: Money;
}) {
  const bookValue = Math.max(params.acquisitionCost - params.accumulatedDepreciation, 0);
  return {
    bookValue,
    gainLoss: params.proceeds - bookValue,
  };
}

export function buildFixedAssetDisposalJournal(params: {
  businessId: string;
  disposal: Pick<FixedAssetDisposal, "id" | "date" | "proceeds" | "bookValue" | "gainLoss" | "reason">;
  asset: Pick<FixedAsset, "assetNo" | "acquisitionCost">;
  accumulatedDepreciation: Money;
}): JournalEntry {
  const lines: JournalLine[] = [];

  if (params.disposal.proceeds > 0) {
    lines.push(makeLine(systemAccounts, accountCodes.cash, "debit", params.disposal.proceeds, params.asset.assetNo));
  }

  if (params.accumulatedDepreciation > 0) {
    lines.push(
      makeLine(systemAccounts, accountCodes.accumulatedDepreciation, "debit", params.accumulatedDepreciation, params.asset.assetNo),
    );
  }

  if (params.disposal.gainLoss < 0) {
    lines.push(
      makeLine(systemAccounts, accountCodes.fixedAssetDisposalLoss, "debit", Math.abs(params.disposal.gainLoss), params.asset.assetNo),
    );
  }

  lines.push(makeLine(systemAccounts, accountCodes.fixedAssets, "credit", params.asset.acquisitionCost, params.asset.assetNo));

  if (params.disposal.gainLoss > 0) {
    lines.push(
      makeLine(systemAccounts, accountCodes.fixedAssetDisposalGain, "credit", params.disposal.gainLoss, params.asset.assetNo),
    );
  }

  return createJournalEntry({
    businessId: params.businessId,
    date: params.disposal.date,
    description: `Pelepasan aset tetap ${params.asset.assetNo}`,
    source: "fixed_asset",
    referenceId: params.disposal.id,
    lines,
    accounts: systemAccounts,
  });
}

export function fixedAssetRegisterTotals(params: {
  assets: FixedAsset[];
  depreciationLines: FixedAssetDepreciationLine[];
}) {
  const activeAssets = params.assets.filter((asset) => asset.status !== "disposed");
  const acquisitionCost = activeAssets.reduce((total, asset) => total + asset.acquisitionCost, 0);
  const accumulatedDepreciation = activeAssets.reduce(
    (total, asset) => total + accumulatedDepreciationForAsset(asset.id, params.depreciationLines),
    0,
  );

  return {
    assetCount: activeAssets.length,
    acquisitionCost,
    accumulatedDepreciation,
    bookValue: Math.max(acquisitionCost - accumulatedDepreciation, 0),
  };
}
