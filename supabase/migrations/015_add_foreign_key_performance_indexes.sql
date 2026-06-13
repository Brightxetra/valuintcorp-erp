-- Add explicit indexes for foreign keys reported by the Supabase database linter.
-- Existing workload indexes are kept; "unused index" suggestions are intentionally
-- ignored until production traffic is large enough to prove they are safe to drop.

create index if not exists attachments_business_id_fk_idx
  on public.attachments (business_id);

create index if not exists attendance_employee_id_fk_idx
  on public.attendance (employee_id);

create index if not exists daily_transaction_summaries_location_id_fk_idx
  on public.daily_transaction_summaries (location_id);

create index if not exists daily_transaction_summaries_posted_journal_entry_id_fk_idx
  on public.daily_transaction_summaries (posted_journal_entry_id);

create index if not exists demo_sandboxes_demo_user_account_id_fk_idx
  on public.demo_sandboxes (demo_user_account_id);

create index if not exists fixed_asset_depreciation_lines_asset_id_fk_idx
  on public.fixed_asset_depreciation_lines (asset_id);

create index if not exists fixed_asset_depreciation_lines_run_id_fk_idx
  on public.fixed_asset_depreciation_lines (run_id);

create index if not exists fixed_asset_depreciation_runs_journal_entry_id_fk_idx
  on public.fixed_asset_depreciation_runs (journal_entry_id);

create index if not exists fixed_asset_disposals_asset_id_fk_idx
  on public.fixed_asset_disposals (asset_id);

create index if not exists fixed_asset_disposals_journal_entry_id_fk_idx
  on public.fixed_asset_disposals (journal_entry_id);

create index if not exists fixed_assets_journal_entry_id_fk_idx
  on public.fixed_assets (journal_entry_id);

create index if not exists fixed_assets_location_id_fk_idx
  on public.fixed_assets (location_id);

create index if not exists fixed_assets_supplier_id_fk_idx
  on public.fixed_assets (supplier_id);

create index if not exists import_batches_business_id_fk_idx
  on public.import_batches (business_id);

create index if not exists inventory_items_default_warehouse_id_fk_idx
  on public.inventory_items (default_warehouse_id);

create index if not exists journal_entries_reversed_entry_id_fk_idx
  on public.journal_entries (reversed_entry_id);

create index if not exists journal_entries_transaction_id_fk_idx
  on public.journal_entries (transaction_id);

create index if not exists journal_lines_account_id_fk_idx
  on public.journal_lines (account_id);

create index if not exists journal_lines_business_id_fk_idx
  on public.journal_lines (business_id);

create index if not exists journal_lines_journal_entry_id_fk_idx
  on public.journal_lines (journal_entry_id);

create index if not exists leave_requests_business_id_fk_idx
  on public.leave_requests (business_id);

create index if not exists leave_requests_employee_id_fk_idx
  on public.leave_requests (employee_id);

create index if not exists locations_warehouse_id_fk_idx
  on public.locations (warehouse_id);

create index if not exists payment_allocations_payment_id_fk_idx
  on public.payment_allocations (payment_id);

create index if not exists payments_journal_entry_id_fk_idx
  on public.payments (journal_entry_id);

create index if not exists payroll_runs_business_id_fk_idx
  on public.payroll_runs (business_id);

create index if not exists payroll_runs_employee_id_fk_idx
  on public.payroll_runs (employee_id);

create index if not exists payroll_runs_journal_entry_id_fk_idx
  on public.payroll_runs (journal_entry_id);

create index if not exists products_default_warehouse_id_fk_idx
  on public.products (default_warehouse_id);

create index if not exists purchase_bill_lines_business_id_fk_idx
  on public.purchase_bill_lines (business_id);

create index if not exists purchase_bill_lines_product_id_fk_idx
  on public.purchase_bill_lines (product_id);

create index if not exists purchase_bill_lines_purchase_bill_id_fk_idx
  on public.purchase_bill_lines (purchase_bill_id);

create index if not exists purchase_bill_lines_warehouse_id_fk_idx
  on public.purchase_bill_lines (warehouse_id);

create index if not exists purchase_bills_journal_entry_id_fk_idx
  on public.purchase_bills (journal_entry_id);

create index if not exists purchase_bills_supplier_id_fk_idx
  on public.purchase_bills (supplier_id);

create index if not exists raw_import_batches_location_id_fk_idx
  on public.raw_import_batches (location_id);

create index if not exists raw_payments_raw_transaction_id_fk_idx
  on public.raw_payments (raw_transaction_id);

create index if not exists raw_transaction_lines_product_id_fk_idx
  on public.raw_transaction_lines (product_id);

create index if not exists raw_transaction_lines_raw_transaction_id_fk_idx
  on public.raw_transaction_lines (raw_transaction_id);

create index if not exists raw_transactions_batch_id_fk_idx
  on public.raw_transactions (batch_id);

create index if not exists raw_transactions_location_id_fk_idx
  on public.raw_transactions (location_id);

create index if not exists sales_invoice_lines_business_id_fk_idx
  on public.sales_invoice_lines (business_id);

create index if not exists sales_invoice_lines_product_id_fk_idx
  on public.sales_invoice_lines (product_id);

create index if not exists sales_invoice_lines_sales_invoice_id_fk_idx
  on public.sales_invoice_lines (sales_invoice_id);

create index if not exists sales_invoice_lines_warehouse_id_fk_idx
  on public.sales_invoice_lines (warehouse_id);

create index if not exists sales_invoices_customer_id_fk_idx
  on public.sales_invoices (customer_id);

create index if not exists sales_invoices_journal_entry_id_fk_idx
  on public.sales_invoices (journal_entry_id);

create index if not exists settlement_records_location_id_fk_idx
  on public.settlement_records (location_id);

create index if not exists stock_adjustments_item_id_fk_idx
  on public.stock_adjustments (item_id);

create index if not exists stock_adjustments_journal_entry_id_fk_idx
  on public.stock_adjustments (journal_entry_id);

create index if not exists stock_adjustments_warehouse_id_fk_idx
  on public.stock_adjustments (warehouse_id);

create index if not exists stock_movements_item_id_fk_idx
  on public.stock_movements (item_id);

create index if not exists stock_movements_journal_entry_id_fk_idx
  on public.stock_movements (journal_entry_id);

create index if not exists stock_movements_warehouse_id_fk_idx
  on public.stock_movements (warehouse_id);

create index if not exists stock_opnames_warehouse_id_fk_idx
  on public.stock_opnames (warehouse_id);

create index if not exists stock_transfers_from_warehouse_id_fk_idx
  on public.stock_transfers (from_warehouse_id);

create index if not exists stock_transfers_item_id_fk_idx
  on public.stock_transfers (item_id);

create index if not exists stock_transfers_to_warehouse_id_fk_idx
  on public.stock_transfers (to_warehouse_id);

create index if not exists transaction_source_mappings_default_location_id_fk_idx
  on public.transaction_source_mappings (default_location_id);

create index if not exists transaction_source_mappings_transaction_source_id_fk_idx
  on public.transaction_source_mappings (transaction_source_id);

create index if not exists transaction_sources_location_id_fk_idx
  on public.transaction_sources (location_id);

create index if not exists transactions_business_id_fk_idx
  on public.transactions (business_id);
