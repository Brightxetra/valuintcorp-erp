import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { systemAccounts } from "@/lib/accounting/chart";
import {
  buildBalanceSheet,
  buildCalkNotes,
  buildDashboardMetrics,
  buildIncomeStatement,
} from "@/lib/reports/reports";
import type { Business, JournalEntry, ReportPeriod, TaxProfile } from "@/lib/domain/types";

type SheetRow = Record<string, string | number>;

function escapeXml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number): string {
  let value = index + 1;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function cellXml(value: string | number, rowIndex: number, columnIndex: number): string {
  const ref = `${columnName(columnIndex)}${rowIndex}`;

  if (typeof value === "number") {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function sheetXml(rows: SheetRow[]): string {
  const keys = Object.keys(rows[0] ?? {});
  const allRows = [Object.fromEntries(keys.map((key) => [key, key])) as SheetRow, ...rows];
  const xmlRows = allRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = keys
        .map((key, columnIndex) => cellXml(row[key] ?? "", rowNumber, columnIndex))
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${xmlRows}</sheetData>
</worksheet>`;
}

function buildXlsx(sheets: { name: string; rows: SheetRow[] }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets
      .map(
        (sheet, index) =>
          `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join("")}
  </sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("")}
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf xfId="0"/></cellXfs>
</styleSheet>`),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet.rows));
  });

  return zipSync(files, { level: 6 });
}

export async function buildFinancialWorkbook(params: {
  business: Business;
  taxProfile: TaxProfile;
  entries: JournalEntry[];
  period: ReportPeriod;
}): Promise<Uint8Array> {
  const income = buildIncomeStatement(params.entries, params.period, systemAccounts);
  const balance = buildBalanceSheet(params.entries, params.period, systemAccounts);
  const metrics = buildDashboardMetrics(params.entries, params.period, systemAccounts);
  const notes = buildCalkNotes({
    business: params.business,
    taxProfile: params.taxProfile,
    period: params.period,
  });

  return buildXlsx([
    {
      name: "Dashboard",
      rows: [
      { metric: "Omzet", amount: metrics.revenue },
      { metric: "Laba Kotor", amount: metrics.grossProfit },
      { metric: "Laba Bersih", amount: metrics.netIncome },
      { metric: "Kas", amount: metrics.cash },
      { metric: "Persediaan", amount: metrics.inventory },
      ],
    },
    {
      name: "Laba Rugi",
      rows: [
      ...income.revenue.map((line) => ({ section: "Pendapatan", ...line })),
      ...income.expenses.map((line) => ({ section: "Beban", ...line })),
      { section: "Ringkasan", code: "NET", name: "Laba Bersih", amount: income.netIncome },
      ],
    },
    {
      name: "Posisi Keuangan",
      rows: [
      ...balance.assets.map((line) => ({ section: "Aset", ...line })),
      ...balance.liabilities.map((line) => ({ section: "Liabilitas", ...line })),
      ...balance.equity.map((line) => ({ section: "Ekuitas", ...line })),
      ],
    },
    { name: "CALK", rows: notes },
  ]);
}

export async function buildFinancialPdf(params: {
  business: Business;
  taxProfile: TaxProfile;
  entries: JournalEntry[];
  period: ReportPeriod;
}): Promise<Uint8Array> {
  const income = buildIncomeStatement(params.entries, params.period, systemAccounts);
  const balance = buildBalanceSheet(params.entries, params.period, systemAccounts);
  const metrics = buildDashboardMetrics(params.entries, params.period, systemAccounts);
  const notes = buildCalkNotes({
    business: params.business,
    taxProfile: params.taxProfile,
    period: params.period,
  });
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;

  function text(value: string, x = 48, size = 10, useBold = false) {
    page.drawText(value, {
      x,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.07, 0.09, 0.15),
    });
    y -= size + 9;
  }

  text("Valuintcorp Ledger", 48, 18, true);
  text(`${params.business.displayName} - ${params.period.label}`, 48, 12);
  y -= 8;
  text("Dashboard", 48, 13, true);
  text(`Omzet: IDR ${metrics.revenue.toLocaleString("id-ID")}`);
  text(`Laba bersih: IDR ${metrics.netIncome.toLocaleString("id-ID")}`);
  text(`Kas: IDR ${metrics.cash.toLocaleString("id-ID")}`);
  text(`Persediaan: IDR ${metrics.inventory.toLocaleString("id-ID")}`);
  y -= 8;
  text("Laporan Laba Rugi", 48, 13, true);
  text(`Total pendapatan: IDR ${income.totalRevenue.toLocaleString("id-ID")}`);
  text(`Total beban: IDR ${income.totalExpenses.toLocaleString("id-ID")}`);
  text(`Laba bersih: IDR ${income.netIncome.toLocaleString("id-ID")}`);
  y -= 8;
  text("Laporan Posisi Keuangan", 48, 13, true);
  text(`Total aset: IDR ${balance.totalAssets.toLocaleString("id-ID")}`);
  text(`Total liabilitas: IDR ${balance.totalLiabilities.toLocaleString("id-ID")}`);
  text(`Total ekuitas: IDR ${balance.totalEquity.toLocaleString("id-ID")}`);
  y -= 8;
  text("Catatan", 48, 13, true);
  notes.slice(0, 3).forEach((note) => text(`${note.title}: ${note.body.slice(0, 92)}`));

  return pdf.save();
}
