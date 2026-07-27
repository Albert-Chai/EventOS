/**
 * Minimal RFC 4180 CSV serialization for the analytics exports (spec §8.14). No
 * dependency: escaping is the whole job. A field is quoted when it contains a
 * comma, quote, or newline; embedded quotes are doubled. A leading `=`/`+`/`-`/`@`
 * is prefixed so spreadsheets don't interpret an exported value as a formula.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function escapeField(raw: string | number | null | undefined): string {
  let s = raw == null ? "" : String(raw);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeField(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(c.value(row))).join(","));
  }
  // Trailing newline: POSIX-friendly and avoids a "no newline at end of file" tail.
  return lines.join("\r\n") + "\r\n";
}
