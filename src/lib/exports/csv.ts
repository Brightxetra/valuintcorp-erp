export type CsvValue = string | number | boolean | null | undefined;

function csvCell(value: CsvValue) {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsvContent(headers: string[], rows: CsvValue[][]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsvFile(filename: string, headers: string[], rows: CsvValue[][]) {
  const content = `\uFEFF${buildCsvContent(headers, rows)}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
