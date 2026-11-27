import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import {
  loadSupabaseWorkspace,
  type WorkspaceLoadContext,
  type WorkspaceLoadProfile,
} from "@/lib/erp/workspace-repository";

type QueryResponse = { data: unknown; error: null };

const context: WorkspaceLoadContext = {
  businessId: "business-1",
  role: "owner",
  userId: "user-1",
  userEmail: "owner@example.test",
  userName: "Owner",
};

class FakeQuery implements PromiseLike<QueryResponse> {
  constructor(
    private readonly table: string,
    private readonly recordSelection: (table: string, columns: string | undefined) => void,
  ) {}

  select(columns?: string) {
    this.recordSelection(this.table, columns);
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  single() {
    return Promise.resolve(this.response(true));
  }

  maybeSingle() {
    return Promise.resolve(this.response(false));
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.response(false)).then(onfulfilled, onrejected);
  }

  private response(single: boolean): QueryResponse {
    if (this.table === "businesses") {
      return {
        data: {
          id: context.businessId,
          legal_name: "PT Test",
          display_name: "Test",
          industry: "general",
          owner_name: "Owner",
          period_start_month: 1,
        },
        error: null,
      };
    }

    if (single) return { data: null, error: null };
    return { data: [], error: null };
  }
}

class FakeSupabase {
  readonly tables: string[] = [];
  readonly selections = new Map<string, string[]>();

  from(table: string) {
    this.tables.push(table);
    return new FakeQuery(table, (selectedTable, columns) => {
      const selections = this.selections.get(selectedTable) ?? [];
      selections.push(columns ?? "");
      this.selections.set(selectedTable, selections);
    });
  }
}

async function loadedWorkspace(profile: WorkspaceLoadProfile, contextOverride: Partial<WorkspaceLoadContext> = {}) {
  const fake = new FakeSupabase();
  await loadSupabaseWorkspace(fake as unknown as SupabaseClient, { ...context, ...contextOverride }, { profile });
  return fake;
}

async function loadedTables(profile: WorkspaceLoadProfile, contextOverride: Partial<WorkspaceLoadContext> = {}) {
  return (await loadedWorkspace(profile, contextOverride)).tables;
}

describe("loadSupabaseWorkspace profile selection", () => {
  test("shell profile only loads shell-sized data", async () => {
    const tables = await loadedTables("shell", {
      accessScope: "custom",
      permissions: ["pos:read", "pos:sell"],
      role: "staff",
    });

    expect(tables).toContain("businesses");
    expect(tables).toContain("activity_events");
    expect(tables).not.toContain("sales_invoices");
    expect(tables).not.toContain("purchase_bills");
    expect(tables).not.toContain("journal_entries");
    expect(tables).not.toContain("raw_import_batches");
    expect(tables).not.toContain("daily_transaction_summaries");
    expect(tables).not.toContain("customers");
    expect(tables).not.toContain("products");
    expect(tables).not.toContain("warehouses");
    expect(tables).not.toContain("employees");
    expect(tables).not.toContain("stock_movements");
    expect(tables).not.toContain("fixed_assets");
    expect(tables).not.toContain("attendance");
  });

  test.each(["shell", "pos"] as const)(
    "%s profile selects only the checkout-safe business projection",
    async (profile) => {
      const fake = await loadedWorkspace(profile, {
        accessScope: "custom",
        permissions: ["pos:read"],
        role: "staff",
      });
      const businessSelection = fake.selections.get("businesses")?.[0];

      expect(businessSelection).toBe("id, display_name, industry, logo_url");
      expect(businessSelection).not.toContain("tax_id");
      expect(businessSelection).not.toContain("owner_name");
      expect(businessSelection).not.toContain("legal_name");
      expect(businessSelection).not.toContain("*");
    },
  );

  test("settings profile retains the full administrative business projection", async () => {
    const fake = await loadedWorkspace("settings", {
      permissions: ["business:read"],
      role: "owner",
    });

    expect(fake.selections.get("businesses")?.[0]).toBe("*");
  });

  test("accounting profile retains its documented financial queries", async () => {
    const tables = await loadedTables("accounting", {
      accessScope: "custom",
      permissions: ["accounting:read"],
      role: "finance_admin",
    });

    expect(tables).toContain("sales_invoices");
    expect(tables).toContain("purchase_bills");
    expect(tables).toContain("journal_entries");
    expect(tables).not.toContain("payroll_runs");
  });

  test("sales profile skips unrelated payroll and fixed asset tables", async () => {
    const tables = await loadedTables("sales");

    expect(tables).toContain("sales_invoices");
    expect(tables).toContain("customers");
    expect(tables).toContain("products");
    expect(tables).toContain("warehouses");
    expect(tables).not.toContain("purchase_bills");
    expect(tables).not.toContain("payroll_runs");
    expect(tables).not.toContain("fixed_assets");
  });

  test("payroll profile only loads employee payroll data", async () => {
    const tables = await loadedTables("payroll");

    expect(tables).toContain("employees");
    expect(tables).toContain("payroll_runs");
    expect(tables).not.toContain("sales_invoices");
    expect(tables).not.toContain("purchase_bills");
    expect(tables).not.toContain("stock_movements");
  });

  test.each(["reports", "dashboard", "hr"] as const)(
    "%s profile does not load payroll rows without payroll permission",
    async (profile) => {
      const tables = await loadedTables(profile, {
        accessScope: "custom",
        permissions: profile === "hr" ? ["hr:manage"] : profile === "reports" ? ["reports:export"] : ["business:read"],
        role: "finance_admin",
      });

      expect(tables).not.toContain("payroll_runs");
    },
  );

  test("reports profile keeps payroll data for an explicitly authorized viewer", async () => {
    const tables = await loadedTables("reports", {
      accessScope: "custom",
      permissions: ["reports:export", "payroll:run"],
      role: "finance_admin",
    });

    expect(tables).toContain("payroll_runs");
  });
});
