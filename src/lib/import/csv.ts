export interface ParsedCsvRow {
  rowNumber: number;
  values: Record<string, string>;
  fingerprint: string;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  duplicates: ParsedCsvRow[];
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseCsv(
  text: string,
  requiredHeaders: string[],
  fingerprintHeaders = ["date", "amount", "description", "reference"],
): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], duplicates: [], errors: ["CSV is empty."] };
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header.toLowerCase()));

  if (missingHeaders.length > 0) {
    return {
      rows: [],
      duplicates: [],
      errors: [`Missing headers: ${missingHeaders.join(", ")}`],
    };
  }

  const seen = new Set<string>();
  const rows: ParsedCsvRow[] = [];
  const duplicates: ParsedCsvRow[] = [];

  for (const [index, line] of lines.slice(1).entries()) {
    const values = splitCsvLine(line);
    const mapped = Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] ?? ""]));
    const fingerprint = fingerprintHeaders.map((header) => mapped[header] ?? "").join("|");
    const row = { rowNumber: index + 2, values: mapped, fingerprint };

    if (seen.has(fingerprint)) {
      duplicates.push(row);
    } else {
      seen.add(fingerprint);
      rows.push(row);
    }
  }

  return { rows, duplicates, errors: [] };
}
