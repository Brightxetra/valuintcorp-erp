# Pilot UAT Scenarios

## Pilot Group

Run beta with 5-10 UMKM across jasa, retail, F&B, and online seller profiles. Each pilot should complete onboarding, one reporting cycle, export review, and feedback on daily input.

## Scenarios

- Jasa: opening balance, service revenue, operating expenses, payroll, profit and cash review.
- Retail multi-gudang: SKU setup, purchase, sale with COGS, transfer, stock opname, inventory value report.
- F&B simple: sales, HPP, stock movements, staff payroll, Coretax preparation package.
- Payroll: employee master data, attendance, leave request, payroll run, slip summary, payroll journal.
- CSV import: valid rows, duplicated rows, invalid headers, import preview, rollback.
- Security: staff cannot export reports, external advisor cannot mutate journals, tenant data is isolated.

## Acceptance Criteria

- Trial balance is zero for every posted report cycle.
- Laporan laba rugi and laporan posisi keuangan reconcile against journal entries.
- Export PDF/XLSX opens without manual repair.
- Locked period cannot be edited directly.
- Pilot owner can understand cash, profit, receivable, payable, stock value, payroll cost, and tax estimate from the dashboard.
