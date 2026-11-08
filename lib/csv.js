// Minimal RFC 4180 CSV parser plus header -> question matching.
(function (root) {
  'use strict';
  const GFF = root.GFF || (root.GFF = {});
  const gen = GFF.gen || (typeof require === 'function' ? require('./generators.js') : null);

  // Excel with Vietnamese locale often saves with ";" — pick whichever delimiter dominates the header line.
  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    let best = ',';
    let bestCount = 0;
    for (const d of [',', ';', '\t']) {
      const count = firstLine.split(d).length - 1;
      if (count > bestCount) {
        best = d;
        bestCount = count;
      }
    }
    return best;
  }

  function parseRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  // Returns { headers: string[], rows: string[][] }. Fully empty lines are dropped.
  function parseCSV(text, delimiter) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const d = delimiter || detectDelimiter(clean);
    const all = parseRows(clean, d).filter((r) => r.some((v) => v.trim() !== ''));
    if (!all.length) return { headers: [], rows: [] };
    const headers = all[0].map((h) => h.trim());
    const rows = all.slice(1).map((r) => headers.map((_, i) => (r[i] == null ? '' : r[i])));
    return { headers, rows };
  }

  function normalizeKey(s) {
    const strip = gen.stripDiacritics;
    return strip(String(s || ''))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // { [questionKey]: headerName } for every question whose title matches a header.
  function autoMap(headers, questions) {
    const byKey = new Map();
    headers.forEach((h) => {
      const k = normalizeKey(h);
      if (k && !byKey.has(k)) byKey.set(k, h);
    });
    const map = {};
    for (const q of questions) {
      const h = byKey.get(normalizeKey(q.title)) || byKey.get(normalizeKey(q.key));
      if (h != null) map[q.key] = h;
    }
    return map;
  }

  // Grid rows: { [questionKey]: { [rowEntryId]: headerName } }. A header matches a row when it equals
  // the row label, or "Grid title [row label]" as in the Google Sheets responses export.
  function autoMapGrid(headers, questions) {
    const byKey = new Map();
    headers.forEach((h) => {
      const k = normalizeKey(h);
      if (k && !byKey.has(k)) byKey.set(k, h);
    });
    const map = {};
    for (const q of questions) {
      if (q.type !== 'grid' || !Array.isArray(q.rows)) continue;
      for (const row of q.rows) {
        const h = byKey.get(normalizeKey(`${q.title} ${row.label}`)) || byKey.get(normalizeKey(row.label));
        if (h == null) continue;
        (map[q.key] || (map[q.key] = {}))[row.entryId] = h;
      }
    }
    return map;
  }

  GFF.csv = { detectDelimiter, parseCSV, normalizeKey, autoMap, autoMapGrid };
  if (typeof module !== 'undefined' && module.exports) module.exports = GFF.csv;
})(typeof globalThis !== 'undefined' ? globalThis : this);
