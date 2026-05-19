// =============================================================
// CSV import helper
// Fetches a gzipped CSV from a URL, decompresses with the
// platform's DecompressionStream, parses with a small inline
// RFC-4180 parser. Returns an array of row objects keyed by
// the header row. Used by the Rebrickable bulk import.
// =============================================================

export async function fetchGzippedCsv(url) {
  const r = await fetch(url, {
    headers: { "Accept": "*/*", "User-Agent": "Brickvault/2.0" },
  });
  if (!r.ok) throw new Error(`Fetch ${url}: HTTP ${r.status} ${r.statusText}`);

  // Decompress the gzip stream — DecompressionStream is a
  // Web Streams API standard and works in V8 isolates.
  const decompressed = r.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(decompressed).text();

  return parseCsv(text);
}

// Minimal RFC-4180 CSV parser. Handles:
//   - quoted fields (with embedded commas, newlines, "")
//   - CRLF or LF line endings
//   - first row as headers → returns array of objects
//
// Rebrickable's CSV files are well-formed (UTF-8, RFC-4180), so
// this is robust enough without pulling in csv-parse.
export function parseCsv(text) {
  if (!text) return [];
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { cell += c; i++; }
    } else {
      if (c === '"' && cell === "") { inQuotes = true; i++; }
      else if (c === ",") { row.push(cell); cell = ""; i++; }
      else if (c === "\n") {
        row.push(cell); rows.push(row);
        row = []; cell = ""; i++;
      } else if (c === "\r") {
        // swallow lone CR or CRLF
        if (text[i + 1] === "\n") i += 2; else i++;
        row.push(cell); rows.push(row);
        row = []; cell = "";
      } else { cell += c; i++; }
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell); rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim());

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    if (rows[r].length === 1 && rows[r][0] === "") continue; // skip empty
    const obj = {};
    for (let k = 0; k < header.length; k++) {
      obj[header[k]] = rows[r][k] ?? "";
    }
    out.push(obj);
  }
  return out;
}
