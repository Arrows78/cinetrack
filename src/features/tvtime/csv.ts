/**
 * Minimal RFC 4180 CSV parser — quoted fields, escaped quotes, CRLF.
 * TV Time GDPR exports are machine-generated so this stays deliberately
 * strict: no configurable delimiters, no comment lines.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") pushField();
    else if (char === "\n") pushRow();
    else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const [header, ...records] = rows;
  if (!header) return [];

  return records
    .filter((record) => record.some((value) => value !== ""))
    .map((record) => Object.fromEntries(header.map((column, index) => [column, record[index] ?? ""])));
}
