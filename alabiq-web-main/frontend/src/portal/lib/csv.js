// ---------------------------------------------------------------------
// Shared CSV export helpers — used by the admin Reports tab (Pick & Drop)
// and the Food settlement export. Pure browser-side: builds a text/csv Blob
// and triggers a download, no backend round-trip for the file itself.
// ---------------------------------------------------------------------

// Spreadsheet formula injection: Excel, Google Sheets and LibreOffice all
// EXECUTE a cell whose first character is = + - @ (or a leading tab/CR), no
// matter how correctly the file is quoted for CSV. Our exports carry
// merchant-supplied text — store and restaurant names, and now product names
// and SKUs — and are opened by finance staff on our own machines, so a
// malicious catalogue row is a path to code execution on the operator's
// desktop. Prefixing with a single quote makes the cell inert text; the
// quote is not displayed by the spreadsheet.
function neutralizeFormula(s) {
  // A genuine negative number must stay a number, or the first refund or
  // adjustment column added to an export would land as text and silently
  // break every spreadsheet sum downstream.
  if (s !== '' && Number.isFinite(Number(s))) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

// Quote a value only when it contains a comma, quote, or newline (RFC 4180).
export function csvEscape(v) {
  const s = neutralizeFormula(v == null ? '' : String(v));
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// rows: array of objects. columns: array of { key, header }.
export function toCsv(rows, columns) {
  const head = columns.map((c) => csvEscape(c.header)).join(',');
  const body = (rows || [])
    .map((r) => columns.map((c) => csvEscape(r[c.key])).join(','))
    .join('\n');
  return body ? `${head}\n${body}` : head;
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
