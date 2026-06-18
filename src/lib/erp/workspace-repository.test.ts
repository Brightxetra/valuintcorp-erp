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
  constructor(private readonly table: string) {}

  select() {
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

  from(table: string) {
    this.tables.push(table);
    return new FakeQuery(table);
  }
}

async function loadedTables(profile: WorkspaceLoadProfile) {
  const fake = new FakeSupabase();
  await loadSupabaseWorkspace(fake as unknown as SupabaseClient, context, { profile });
  return fake.tables;
}

describe("loadSupabaseWorkspace profile selection", () => {
  test("shell profile only loads shell-sized data", async () => {
    const tables = await loadedTables("shell");

    expect(tables).toContain("businesses");
    expect(tables).toContain("sales_invoices");
    expect(tables).toContain("purchase_bills");
    expect(tables).toContain("raw_import_batches");
    expect(tables).toContain("activity_events");
    expect(tables).not.toContain("employees");
    expect(tables).not.toContain("stock_movements");
    expect(tables).not.toContain("fixed_assets");
    expect(tables).not.toContain("attendance");
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
});
