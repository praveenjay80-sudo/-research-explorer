/**
 * Parse a Stanford/Elsevier 2% dataset XLSX file into the JSON format
 * expected by the rankings app.
 *
 * Usage:
 *   npx tsx scripts/parse-stanford.ts <path/to/file.xlsx> <year>
 *
 * Requires: npm install --save-dev xlsx tsx
 */

import * as fs from 'fs';
import * as path from 'path';

// Column name aliases across different dataset versions
const COL_ALIASES: Record<string, string[]> = {
  name:          ['authfull'],
  institution:   ['inst_name'],
  country:       ['cntry'],
  field:         ['sm-field'],
  subfield:      ['sm-subfield-1', 'sm-subfield-1-frac'],
  rank:          ['rank (ns)', 'rank_ns', 'rank'],
  citedByCount:  ['cited_by_cites', 'nc_s', 'nc_d', 'nc_ns'],
  hIndex:        ['h23', 'h24', 'h25', 'h22', 'h21', 'h20', 'h19'],
  worksCount:    ['np_d', 'np6024', 'np6023', 'np6022', 'nps'],
  cScore:        ['c (ns)', 'c (ns)_d', 'c_ns'],
  firstYear:     ['firstyr'],
  lastYear:      ['lastyr'],
  scopusId:      ['Scopus Author ID', 'authid'],
};

function findCol(headers: string[], aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const found = headers.find((h) => h.toLowerCase().trim() === alias.toLowerCase().trim());
    if (found) return found;
  }
  return undefined;
}

async function main() {
  const [, , xlsxPath, yearArg] = process.argv;
  if (!xlsxPath || !yearArg) {
    console.error('Usage: npx tsx scripts/parse-stanford.ts <file.xlsx> <year>');
    process.exit(1);
  }

  const year = parseInt(yearArg, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    console.error('Invalid year:', yearArg);
    process.exit(1);
  }

  // Dynamically require xlsx so the script fails with a helpful message if not installed
  let XLSX: typeof import('xlsx');
  try {
    XLSX = await import('xlsx');
  } catch {
    console.error('Please install xlsx: npm install --save-dev xlsx');
    process.exit(1);
  }

  console.log(`Reading ${xlsxPath}…`);
  const workbook = XLSX.readFile(xlsxPath, { sheetStubs: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    console.error('No rows found in sheet');
    process.exit(1);
  }

  const headers = Object.keys(rows[0]);
  console.log(`Found ${rows.length} rows. Sample headers: ${headers.slice(0, 8).join(', ')}`);

  // Map column aliases to actual column names
  const cols: Record<string, string> = {};
  for (const [key, aliases] of Object.entries(COL_ALIASES)) {
    const found = findCol(headers, aliases);
    if (found) cols[key] = found;
  }

  console.log('Mapped columns:', cols);

  const missing = ['name', 'institution', 'field', 'subfield'].filter((k) => !cols[k]);
  if (missing.length > 0) {
    console.warn(`Warning: could not find columns for: ${missing.join(', ')}`);
    console.warn('Available headers:', headers);
  }

  const entries = rows
    .filter((r) => r[cols.name])
    .map((r, i) => ({
      rank: cols.rank ? parseInt(String(r[cols.rank] ?? i + 1), 10) || i + 1 : i + 1,
      name: String(r[cols.name] ?? '').trim(),
      institution: String(r[cols.institution] ?? '').trim(),
      country: String(r[cols.country] ?? '').trim(),
      field: String(r[cols.field] ?? '').trim(),
      subfield: String(r[cols.subfield] ?? '').trim(),
      citedByCount: parseFloat(String(r[cols.citedByCount] ?? '0')) || 0,
      hIndex: parseFloat(String(r[cols.hIndex] ?? '0')) || 0,
      worksCount: parseFloat(String(r[cols.worksCount] ?? '0')) || 0,
      cScore: parseFloat(String(r[cols.cScore] ?? '0')) || 0,
      firstYear: cols.firstYear ? parseInt(String(r[cols.firstYear] ?? ''), 10) || undefined : undefined,
      lastYear: cols.lastYear ? parseInt(String(r[cols.lastYear] ?? ''), 10) || undefined : undefined,
      scopusId: cols.scopusId ? String(r[cols.scopusId] ?? '').trim() || undefined : undefined,
      openAlexId: undefined as string | undefined,
    }));

  const output = {
    year,
    total: entries.length,
    entries,
  };

  const outPath = path.join(process.cwd(), 'data', 'stanford', `${year}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`✓ Written ${entries.length} entries to ${outPath}`);

  // Summary stats
  const fields = [...new Set(entries.map((e) => e.field))].sort();
  const subfields = [...new Set(entries.map((e) => e.subfield))].sort();
  console.log(`  Fields (${fields.length}): ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '…' : ''}`);
  console.log(`  Subfields (${subfields.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
