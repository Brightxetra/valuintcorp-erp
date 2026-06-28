export type PosProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  sellingPrice: number;
  trackStock: boolean;
  availableQuantity: number | null;
};

export type PosSale = {
  id: string;
  invoiceNo: string;
  date: string;
  total: number;
  cogs: number;
};

export type PosExpense = {
  id: string;
  date: string;
  amount: number;
  category: string;
  memo?: string;
};

export type PosSnapshot = {
  location: { id: string; code: string; name: string; warehouseId?: string };
  date: string;
  products: PosProduct[];
  recap: {
    revenue: number;
    cogs: number;
    miscExpenses: number;
    openingStock: number;
    closingStock: number;
    sales: PosSale[];
    expenses: PosExpense[];
  };
};

export type PosPeriodMode = "daily" | "weekly" | "monthly";
