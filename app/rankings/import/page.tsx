'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { countryFlag, formatCitations } from '@/lib/rankings';

// ── Column glossary ────────────────────────────────────────────────────────
const COLUMN_GUIDE: Record<string, { label: string; explain: string }> = {
  authfull:             { label: 'Full name', explain: "The scientist's full name as it appears in their published papers." },
  inst_name:            { label: 'Institution', explain: 'The last university or research centre where this person worked.' },
  cntry:                { label: 'Country', explain: 'Two-letter country code (e.g. "us" = United States, "gb" = United Kingdom).' },
  np6023:               { label: 'Papers (career)', explain: 'Total papers published in their career. The suffix changes by year (np6022, np2223, etc.) — always means total lifetime publications.' },
  firstyr:              { label: 'First year', explain: 'The year they published their very first paper.' },
  lastyr:               { label: 'Last year', explain: 'The year they published their most recent paper in this dataset.' },
  c:                    { label: 'Total citations', explain: 'Every time another paper cites their work counts as one citation. A score of 10,000 means their papers have been referenced 10,000 times by other scientists.' },
  h23:                  { label: 'H-index', explain: 'If h-index = 40, they have 40 papers each cited ≥40 times. Measures both productivity and impact. Average professor ≈ 15–25; top global researcher ≈ 60+. Year suffix varies (h22, h21…).' },
  hm_s:                 { label: 'Hm-index', explain: 'A fairer version of the h-index that accounts for how many co-authors each paper has. Better for comparing researchers across fields.' },
  nps:                  { label: 'Solo/first/last author papers', explain: 'Papers where they are the only author, the first author, or the last author — typically their highest-contribution work.' },
  ncs:                  { label: 'Citations to solo papers', explain: 'Total citations received by papers where they were sole, first, or last author.' },
  cpsf:                 { label: 'First/sole author papers', explain: 'Papers where they are the only author or the first-listed author (usually the person who did the most work).' },
  ncsf:                 { label: 'Citations to first-author papers', explain: 'Citations to papers where they led the research as sole or first author.' },
  npsfl:                { label: 'First/last author papers', explain: 'Papers where they were first or last author. In many fields the last author is the senior supervisor who directed the project.' },
  ncsfl:                { label: 'Citations to first/last author papers', explain: 'Citations specifically from papers where they held a lead role (first or last author).' },
  self_share:           { label: 'Self-citation %', explain: 'Fraction of their citations that come from their own papers citing themselves. High self-citation (>40%) can inflate counts — lower is generally more credible.' },
  author_pos:           { label: 'Author position', explain: '1 = first author (led the work); last number = senior supervisor. Middle positions = collaborator.' },
  'sm-subfield-1':      { label: 'Subfield', explain: 'Their main research subfield in the Stanford/Science-Metrix system (~174 subfields, e.g. "Oncology", "Machine Learning & AI").' },
  'sm-field':           { label: 'Field', explain: 'Their broad research field (22 top-level fields, e.g. "Medicine", "Computer & Information Sciences").' },
  'sm-subfield-1-frac': { label: 'Subfield fraction', explain: 'Fraction of their papers in this subfield (0–1). A score of 0.8 means 80% of their work is in this subfield.' },
  rank_ns:              { label: 'Rank by ns', explain: 'Rank among all scientists in their subfield by normalised score. Rank 1 = most impactful in their subfield.' },
  ns:                   { label: 'Normalised score', explain: 'Citations adjusted for the typical citation rates in their field and year. Score of 1.0 = field average; 5.0 = 5× the field average. Fairer than raw citation counts for cross-field comparisons.' },
  'ns%':                { label: 'Percentile (ns)', explain: "Their percentile in their field. 99 means they're in the top 1% of all scientists globally in their field." },
  cns23:                { label: 'C-score', explain: 'Composite score combining citations, h-index, and normalised score. This is the primary metric Stanford uses to identify the top 2% list. Higher is better.' },
  '#Auth':              { label: 'Total authors', explain: 'Total number of active scientists worldwide in this field.' },
  '% in top-list':      { label: '% in Stanford top-list', explain: 'Percentage of this field\'s scientists who made the Stanford top-2% list.' },
  'Cites@50':           { label: 'Median citations', explain: 'Half of all scientists in this field have fewer citations than this number.' },
  'Cites@95':           { label: '95th percentile citations', explain: 'Only the top 5% of scientists in this field have more citations than this.' },
  'Cites@99':           { label: '99th percentile citations', explain: 'Only the top 1% — the absolute elite — exceed this citation count.' },
  'c@99':               { label: '99th percentile c-score', explain: 'The c-score threshold for the top 1% of scientists in this field.' },
  'top-list cprat@95':  { label: 'Citations/paper (95th)', explain: 'Average citations per paper at the 95th percentile — indicates how intensely individual papers are cited in this field.' },
};

// ── Column detection aliases ──────────────────────────────────────────────
const COL: Record<string, string[]> = {
  name:         ['authfull', 'author', 'name', 'full name', 'author name'],
  institution:  ['inst_name', 'institution', 'affiliation', 'organization', 'inst', 'university'],
  country:      ['cntry', 'country', 'country_code', 'ctry'],
  field:        ['sm-field', 'sm_field', 'field', 'sm field', 'discipline', 'domain'],
  subfield:     ['sm-subfield-1', 'sm_subfield_1', 'subfield', 'sub-field', 'sm subfield 1', 'subfield1', 'sm-subfield'],
  citations:    ['c', 'nc9623', 'nc6023', 'nc2223', 'nc2324', 'nc2425', 'nc2526',
                 'cited_by_count', 'citations', 'total citations', 'nc', 'nc23', 'nc22', 'nc21'],
  hIndex:       ['h23', 'h22', 'h21', 'h20', 'h19', 'h_index', 'h-index', 'hindex', 'h'],
  works:        ['np6023', 'np9623', 'np2223', 'np2324', 'np6022', 'np',
                 'works_count', 'works', 'papers', 'publications'],
  cScore:       ['cns23', 'cns22', 'cns21', 'cns', 'c-score', 'cscore', 'ns', 'composite score'],
  rank:         ['rank', 'rank (ns)', 'rank_ns', 'ns_rank'],
  firstYear:    ['firstyr', 'first_year', 'firstyear', 'first year'],
  lastYear:     ['lastyr', 'last_year', 'lastyear', 'last year'],
  selfShare:    ['self_share', 'selfshare', 'self share'],
  hmIndex:      ['hm_s', 'hm', 'hm_index', 'hm-index'],
  authorPos:    ['author_pos', 'authorpos', 'author position'],
  subfieldFrac: ['sm-subfield-1-frac', 'sm_subfield_1_frac', 'subfield_frac'],
  nsPercentile: ['ns%', 'ns_pct', 'ns percentile'],
};

const T2_COL: Record<string, string[]> = {
  domain:      ['domain'],
  field:       ['field'],
  totalAuth:   ['#auth'],
  top100kNs:   ['#auth top 100k (ns)', '#auth top 100k(ns)'],
  pct100kNs:   ['% in 100k (ns)', '% in 100k(ns)'],
  top100k:     ['#auth top 100k'],
  pct100k:     ['% in 100k'],
  topList:     ['#auth in top-list'],
  pctTopList:  ['% in top-list'],
  cites25:     ['cites@25'], cites50: ['cites@50'], cites75: ['cites@75'],
  cites90:     ['cites@90'], cites95: ['cites@95'], cites99: ['cites@99'],
  c25:         ['c@25'], c50: ['c@50'], c75: ['c@75'],
  c90:         ['c@90'], c95: ['c@95'], c99: ['c@99'],
};

interface ParsedRow {
  name: string; institution: string; country: string;
  field: string; subfield: string;
  citations: number; hIndex: number; works: number;
  cScore?: number; rank?: number;
  firstYear?: number; lastYear?: number;
  selfShare?: number; hmIndex?: number; authorPos?: string;
  nsPercentile?: number; subfieldFrac?: number;
}

interface FieldStatRow {
  domain: string; field: string;
  totalAuth: number; topList: number; pctTopList: number;
  cites50: number; cites95: number; cites99: number;
  c50: number; c99: number;
}

interface Dataset {
  year: string;
  type: 'scientists' | 'fieldstats';
  rows?: ParsedRow[];
  fieldStats?: FieldStatRow[];
  rowCount: number;
  fieldCount: number;
  subfieldCount: number;
  importedAt: string;
  fileName?: string;
}

function findCol(lower: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = lower.findIndex((h) => h === a);
    if (i !== -1) return i;
  }
  for (const a of aliases) {
    const i = lower.findIndex((h) => h.includes(a));
    if (i !== -1) return i;
  }
  return -1;
}

function isTable2(lower: string[]): boolean {
  return lower.some((h) => h === 'domain') && lower.some((h) => h === '#auth' || h.startsWith('#auth'));
}

function parseSheetData(headers: string[], dataRows: string[][]): {
  rows: ParsedRow[]; fieldStats: FieldStatRow[];
  type: 'scientists' | 'fieldstats'; warnings: string[];
} {
  const lower = headers.map((h) => String(h ?? '').toLowerCase().trim());
  const warnings: string[] = [];

  if (isTable2(lower)) {
    const c2: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(T2_COL)) c2[key] = findCol(lower, aliases);
    const fieldStats: FieldStatRow[] = dataRows.map((cells) => {
      const get = (k: string) => (c2[k] >= 0 ? String(cells[c2[k]] ?? '').trim() : '');
      const num = (k: string) => { const v = get(k).replace(/,/g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      return {
        domain: get('domain'), field: get('field'),
        totalAuth: num('totalAuth'), topList: num('topList'), pctTopList: num('pctTopList'),
        cites50: num('cites50'), cites95: num('cites95'), cites99: num('cites99'),
        c50: num('c50'), c99: num('c99'),
      };
    }).filter((r) => r.field);
    return { rows: [], fieldStats, type: 'fieldstats', warnings };
  }

  const cols: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(COL)) cols[key] = findCol(lower, aliases);
  const missing = ['name', 'field', 'citations'].filter((k) => cols[k] === -1);
  if (missing.length) {
    warnings.push(`Could not detect columns: ${missing.join(', ')}. Found: ${headers.slice(0, 14).join(', ')}${headers.length > 14 ? '…' : ''}`);
  }

  const rows: ParsedRow[] = dataRows.map((cells, i) => {
    const get = (k: string) => (cols[k] >= 0 ? String(cells[cols[k]] ?? '').trim() : '');
    const num = (k: string) => { const v = get(k).replace(/,/g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    return {
      name: get('name') || `Row ${i + 1}`, institution: get('institution') || 'Unknown Institution',
      country: get('country'), field: get('field'), subfield: get('subfield'),
      citations: num('citations'), hIndex: Math.round(num('hIndex')), works: Math.round(num('works')),
      cScore: cols['cScore'] >= 0 ? num('cScore') : undefined,
      rank: cols['rank'] >= 0 ? Math.round(num('rank')) : undefined,
      firstYear: cols['firstYear'] >= 0 ? Math.round(num('firstYear')) : undefined,
      lastYear: cols['lastYear'] >= 0 ? Math.round(num('lastYear')) : undefined,
      selfShare: cols['selfShare'] >= 0 ? num('selfShare') : undefined,
      hmIndex: cols['hmIndex'] >= 0 ? num('hmIndex') : undefined,
      authorPos: get('authorPos') || undefined,
      nsPercentile: cols['nsPercentile'] >= 0 ? num('nsPercentile') : undefined,
      subfieldFrac: cols['subfieldFrac'] >= 0 ? num('subfieldFrac') : undefined,
    };
  }).filter((r) => r.name && r.citations >= 0);

  return { rows, fieldStats: [], type: 'scientists', warnings };
}

const RANK_COLORS = ['bg-yellow-400 text-yellow-900', 'bg-slate-300 text-slate-700', 'bg-amber-600 text-white'];

function ColGuide() {
  const [open, setOpen] = useState(false);
  const groups = [
    { title: 'Who they are', cols: ['authfull', 'inst_name', 'cntry', 'firstyr', 'lastyr', 'author_pos'] },
    { title: 'How much they published', cols: ['np6023', 'nps', 'cpsf', 'npsfl'] },
    { title: 'How influential they are', cols: ['c', 'h23', 'hm_s', 'ncs', 'ncsf', 'ncsfl', 'self_share'] },
    { title: 'Field classification', cols: ['sm-field', 'sm-subfield-1', 'sm-subfield-1-frac'] },
    { title: 'Rankings & scores', cols: ['rank_ns', 'ns', 'ns%', 'cns23'] },
    { title: 'Field statistics (Table 2)', cols: ['#Auth', '% in top-list', 'Cites@50', 'Cites@95', 'Cites@99', 'c@99', 'top-list cprat@95'] },
  ];
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-blue-800 hover:bg-blue-100 transition-colors">
        <span>📖 Column Guide — what does each number mean?</span>
        <span className="text-xs text-blue-500 font-normal">{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-blue-200 pt-4">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">{g.title}</h3>
              <div className="space-y-1.5">
                {g.cols.map((key) => {
                  const info = COLUMN_GUIDE[key];
                  if (!info) return null;
                  return (
                    <div key={key} className="flex gap-3 text-xs">
                      <span className="flex-shrink-0 font-mono bg-white border border-blue-200 rounded px-1.5 py-0.5 text-blue-700 w-36 text-center">{key}</span>
                      <div><span className="font-semibold text-slate-700">{info.label}: </span><span className="text-slate-600">{info.explain}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScientistExplain({ scientist, year }: { scientist: ParsedRow; year: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [text, setText] = useState('');

  async function generate() {
    setStatus('loading');
    try {
      const res = await fetch('/api/rankings/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scientist.name, institution: scientist.institution, country: scientist.country,
          field: scientist.field, subfield: scientist.subfield,
          citations: scientist.citations, hIndex: scientist.hIndex, works: scientist.works,
          cScore: scientist.cScore, firstYear: scientist.firstYear, lastYear: scientist.lastYear,
          selfShare: scientist.selfShare,
        }),
      });
      const data = await res.json();
      if (data.explanation) { setText(data.explanation); setStatus('done'); }
      else setStatus('error');
    } catch { setStatus('error'); }
  }

  if (status === 'idle') return (
    <button onClick={generate} className="mt-2 text-xs px-2.5 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors font-medium">
      ✦ Explain this scientist (plain English)
    </button>
  );
  if (status === 'loading') return <p className="mt-2 text-xs text-slate-400 animate-pulse">Generating explanation…</p>;
  if (status === 'error') return <p className="mt-2 text-xs text-red-500">Could not generate explanation. Check ANTHROPIC_API_KEY is set in Railway Variables.</p>;
  return (
    <div className="mt-3 p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-slate-700 leading-relaxed">
      <p className="font-semibold text-violet-700 mb-1">Plain-English explanation · Stanford {year}</p>
      <p>{text}</p>
    </div>
  );
}

export default function ImportPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeYear, setActiveYear] = useState('');
  const [showImport, setShowImport] = useState(true);
  const [yearInput, setYearInput] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedField, setSelectedField] = useState('');
  const [selectedSubfield, setSelectedSubfield] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'citations' | 'hIndex' | 'works' | 'cScore' | 'rank'>('citations');

  const activeDataset = datasets.find((d) => d.year === activeYear);
  const activeRows: ParsedRow[] = activeDataset?.rows ?? [];
  const activeStats: FieldStatRow[] = activeDataset?.fieldStats ?? [];

  const processFile = useCallback(async (file: File, yr: string) => {
    setImporting(true);
    setWarnings([]);
    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (raw.length < 2) { setWarnings(['File appears empty or has only one row.']); return; }

      const headers = (raw[0] as unknown[]).map((h) => String(h ?? ''));
      const dataRows = (raw.slice(1) as unknown[][])
        .map((r) => (r as unknown[]).map((c) => String(c ?? '')))
        .filter((r) => r.some((c) => c.trim()));

      const { rows, fieldStats, type, warnings: w } = parseSheetData(headers, dataRows);
      setWarnings(w);

      if (rows.length === 0 && fieldStats.length === 0) {
        setWarnings((prev) => [...prev, 'No data rows could be parsed. Check the file format.']);
        return;
      }

      const label = yr || file.name.replace(/\.(xlsx?|csv)$/i, '').trim() || `Import ${datasets.length + 1}`;
      const fieldSet = new Set([...rows.map((r) => r.field), ...fieldStats.map((r) => r.field)].filter(Boolean));
      const subSet = new Set(rows.map((r) => r.subfield).filter(Boolean));
      const ds: Dataset = {
        year: label, type,
        rows: type === 'scientists' ? rows : undefined,
        fieldStats: type === 'fieldstats' ? fieldStats : undefined,
        rowCount: rows.length || fieldStats.length,
        fieldCount: fieldSet.size,
        subfieldCount: subSet.size,
        importedAt: new Date().toISOString(),
        fileName: file.name,
      };
      setDatasets((prev) => [...prev.filter((d) => d.year !== label), ds].sort((a, b) => a.year.localeCompare(b.year)));
      setActiveYear(label);
      setShowImport(false);
      setSelectedField(''); setSelectedSubfield(''); setSearch('');
    } catch (err) {
      setWarnings([`Failed to read file: ${String(err)}`]);
    } finally {
      setImporting(false);
    }
  }, [datasets.length]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file, yearInput);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file, yearInput);
  }

  function removeDataset(yr: string) {
    const remaining = datasets.filter((d) => d.year !== yr);
    setDatasets(remaining);
    if (activeYear === yr) {
      setActiveYear(remaining[0]?.year ?? '');
      if (remaining.length === 0) setShowImport(true);
    }
  }

  const fields = useMemo(() => [...new Set(activeRows.map((r) => r.field).filter(Boolean))].sort(), [activeRows]);
  const subfields = useMemo(() =>
    [...new Set(activeRows.filter((r) => !selectedField || r.field === selectedField).map((r) => r.subfield).filter(Boolean))].sort(),
    [activeRows, selectedField]);

  const filtered = useMemo(() => {
    let out = activeRows;
    if (selectedField) out = out.filter((r) => r.field === selectedField);
    if (selectedSubfield) out = out.filter((r) => r.subfield === selectedSubfield);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        r.name.toLowerCase().includes(q) || r.institution.toLowerCase().includes(q) ||
        r.subfield.toLowerCase().includes(q) || r.field.toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) => {
      if (sortBy === 'hIndex') return b.hIndex - a.hIndex;
      if (sortBy === 'works') return b.works - a.works;
      if (sortBy === 'cScore') return (b.cScore ?? 0) - (a.cScore ?? 0);
      if (sortBy === 'rank') return (a.rank ?? 9999) - (b.rank ?? 9999);
      return b.citations - a.citations;
    });
  }, [activeRows, selectedField, selectedSubfield, search, sortBy]);

  const filteredStats = useMemo(() => {
    if (!search.trim()) return activeStats;
    const q = search.toLowerCase();
    return activeStats.filter((r) => r.domain.toLowerCase().includes(q) || r.field.toLowerCase().includes(q));
  }, [activeStats, search]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-lg hidden sm:block">Research Explorer</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/" className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">Search</Link>
            <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50">Stanford Rankings</span>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Stanford Rankings — Import &amp; Browse</h1>
          <p className="text-slate-500 text-sm">
            Import the Stanford dataset Excel file directly from your computer. Supports Table 1 (individual scientists) and Table 2 (field statistics). Load multiple years and switch between them.
          </p>
        </div>

        {/* Year tabs */}
        {datasets.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {datasets.map((d) => (
              <div key={d.year} className="flex items-center">
                <button
                  onClick={() => { setActiveYear(d.year); setShowImport(false); setSelectedField(''); setSelectedSubfield(''); setSearch(''); }}
                  className={`px-4 py-2 rounded-l-lg text-sm font-semibold border transition-colors ${
                    activeYear === d.year ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {d.year}
                  <span className={`ml-1.5 text-xs font-normal ${activeYear === d.year ? 'text-red-200' : 'text-slate-400'}`}>
                    {d.type === 'fieldstats' ? 'Field stats' : `${d.rowCount.toLocaleString()} scientists`}
                  </span>
                </button>
                <button onClick={() => removeDataset(d.year)} className="px-2 py-2 rounded-r-lg text-xs border-y border-r border-slate-200 bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove">×</button>
              </div>
            ))}
            <button onClick={() => { setShowImport(true); setActiveYear(''); }} className="px-3 py-2 rounded-lg text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors">
              + Add year
            </button>
          </div>
        )}

        {/* Import panel */}
        {showImport && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            {/* Year label */}
            <div className="flex items-center gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Year label (optional)</label>
                <input
                  type="text" value={yearInput} onChange={(e) => setYearInput(e.target.value)}
                  placeholder="e.g. 2023"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-slate-400 mt-4">If left blank, the file name is used as the label.</p>
            </div>

            {/* Drop zone / file picker */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <p className="text-sm text-slate-600 font-medium">Reading file…</p>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-100 flex items-center justify-center">
                    <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-slate-700 mb-1">Click to browse or drag &amp; drop</p>
                  <p className="text-sm text-slate-500">Supports <strong>.xlsx</strong>, <strong>.xls</strong>, and <strong>.csv</strong></p>
                  <p className="text-xs text-slate-400 mt-2">Works with Table 1 (scientists) and Table 2 (field statistics) from the Stanford dataset</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Browse file…
                  </button>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}

            {datasets.length > 0 && (
              <button onClick={() => { setShowImport(false); setActiveYear(datasets[datasets.length - 1].year); }} className="text-sm text-slate-500 hover:text-slate-700 underline">
                ← Back to results
              </button>
            )}
          </div>
        )}

        {/* ── Field stats (Table 2) view ── */}
        {activeDataset?.type === 'fieldstats' && !showImport && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-6">
                <div><p className="text-2xl font-bold text-slate-900">{activeStats.length}</p><p className="text-xs text-slate-500">fields</p></div>
                <div className="ml-auto">
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">Stanford {activeDataset.year} · Field Statistics</span>
                </div>
              </div>
              {activeDataset.fileName && <p className="text-xs text-slate-400 mt-1">{activeDataset.fileName}</p>}
            </div>
            <ColGuide />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by field name…" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Domain</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Field</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">#Authors</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">In top-list</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">% top-list</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Median cites</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">95th %ile</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">99th %ile</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Median c-score</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">99th c-score</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500">{row.domain}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{row.field}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.totalAuth.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.topList.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right"><span className="font-semibold text-blue-700">{row.pctTopList.toFixed(1)}%</span></td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCitations(row.cites50)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCitations(row.cites95)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCitations(row.cites99)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.c50.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.c99.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Individual scientists (Table 1) view ── */}
        {activeDataset?.type === 'scientists' && !showImport && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-6">
                <div><p className="text-2xl font-bold text-slate-900">{activeDataset.rowCount.toLocaleString()}</p><p className="text-xs text-slate-500">scientists</p></div>
                <div><p className="text-2xl font-bold text-slate-900">{activeDataset.fieldCount}</p><p className="text-xs text-slate-500">fields</p></div>
                <div><p className="text-2xl font-bold text-slate-900">{activeDataset.subfieldCount}</p><p className="text-xs text-slate-500">subfields</p></div>
                <div className="ml-auto text-right">
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">Stanford {activeDataset.year}</span>
                  {activeDataset.fileName && <p className="text-xs text-slate-400 mt-1">{activeDataset.fileName}</p>}
                </div>
              </div>
            </div>

            <ColGuide />

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Field <span className="font-normal normal-case text-slate-400">({fields.length})</span></label>
                  <select value={selectedField} onChange={(e) => { setSelectedField(e.target.value); setSelectedSubfield(''); }} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All fields ({activeDataset.fieldCount})</option>
                    {fields.map((f) => <option key={f} value={f}>{f} ({activeRows.filter((r) => r.field === f).length.toLocaleString()})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Subfield <span className="font-normal normal-case text-slate-400">({subfields.length})</span></label>
                  <select value={selectedSubfield} onChange={(e) => setSelectedSubfield(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All subfields</option>
                    {subfields.map((s) => (
                      <option key={s} value={s}>{s} ({activeRows.filter((r) => r.subfield === s && (!selectedField || r.field === selectedField)).length.toLocaleString()})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-48">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Search</label>
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, institution, subfield…" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Sort by</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="citations">Citations</option>
                    <option value="hIndex">H-index</option>
                    <option value="works">Works</option>
                    <option value="cScore">C-score</option>
                    <option value="rank">Original rank</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Results header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                {selectedSubfield ? <>{selectedSubfield}{selectedField && <span className="text-slate-400 font-normal"> · {selectedField}</span>}</> : selectedField || 'All scientists'}
                <span className="ml-2 text-slate-400 font-normal">{filtered.length.toLocaleString()} results</span>
              </h2>
              <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-medium">Stanford {activeDataset.year}</span>
            </div>

            {/* Scientist cards */}
            <div className="space-y-2.5">
              {filtered.slice(0, 250).map((s, i) => {
                const rank = i + 1;
                const rankCls = rank <= 3 ? RANK_COLORS[rank - 1] : 'bg-slate-100 text-slate-500';
                const flag = countryFlag(s.country);
                const activeYears = s.firstYear && s.lastYear ? `${s.firstYear}–${s.lastYear}` : null;
                return (
                  <div key={`${s.name}-${i}`} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm hover:border-slate-300 transition-all">
                    <div className="flex items-start gap-3">
                      <span className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${rankCls}`}>{rank}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{s.name}</h3>
                          <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">Stanford {activeDataset.year}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{flag && <span className="mr-1">{flag}</span>}{s.institution}</p>
                        {(s.field || s.subfield) && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {s.subfield && <span className="font-medium text-slate-500">{s.subfield}</span>}
                            {s.subfield && s.field && <span> · </span>}
                            {s.field}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="flex items-center gap-0.5 text-xs text-blue-700 font-semibold">
                            <span className="text-blue-500">★</span>
                            <span>{formatCitations(s.citations)}</span>
                            <span className="text-blue-400 font-normal">citations</span>
                          </span>
                          <span className="text-xs text-slate-600"><span className="font-semibold">h{s.hIndex}</span><span className="text-slate-400"> h-index</span></span>
                          <span className="text-xs text-slate-600"><span className="font-semibold">{formatCitations(s.works)}</span><span className="text-slate-400"> works</span></span>
                          {s.cScore !== undefined && s.cScore > 0 && (
                            <span className="text-xs text-slate-600"><span className="font-semibold">{s.cScore.toFixed(3)}</span><span className="text-slate-400"> c-score</span></span>
                          )}
                          {s.hmIndex !== undefined && s.hmIndex > 0 && (
                            <span className="text-xs text-slate-600"><span className="font-semibold">{s.hmIndex.toFixed(1)}</span><span className="text-slate-400"> hm</span></span>
                          )}
                        </div>
                        {(activeYears || s.selfShare !== undefined || s.rank !== undefined || s.nsPercentile !== undefined) && (
                          <div className="flex items-center gap-4 mt-1 flex-wrap">
                            {activeYears && <span className="text-xs text-slate-400"><span className="text-slate-500">{activeYears}</span> active</span>}
                            {s.selfShare !== undefined && <span className="text-xs text-slate-400"><span className="text-slate-500">{(s.selfShare * 100).toFixed(0)}%</span> self-cite</span>}
                            {s.nsPercentile !== undefined && <span className="text-xs text-slate-400">top <span className="text-slate-500 font-medium">{(100 - s.nsPercentile).toFixed(0)}%</span> in field</span>}
                            {s.rank !== undefined && s.rank > 0 && <span className="text-xs text-slate-400">subfield rank <span className="text-slate-500 font-medium">#{s.rank}</span></span>}
                            {s.subfieldFrac !== undefined && s.subfieldFrac > 0 && <span className="text-xs text-slate-400"><span className="text-slate-500">{(s.subfieldFrac * 100).toFixed(0)}%</span> work in subfield</span>}
                          </div>
                        )}
                        <ScientistExplain scientist={s} year={activeDataset.year} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length > 250 && (
              <p className="text-center text-sm text-slate-400 py-4">Showing top 250 of {filtered.length.toLocaleString()} — use the subfield filter to narrow down.</p>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-2xl mb-2">🔍</p>
                <p>No results match your filters.</p>
              </div>
            )}
          </>
        )}

        {datasets.length === 0 && !showImport && (
          <div className="text-center py-16 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400">
            <p className="text-3xl mb-3">📋</p>
            <p className="font-semibold text-slate-600">No data imported yet</p>
            <button onClick={() => setShowImport(true)} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Import file</button>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Files are read entirely in your browser — nothing is uploaded to any server. Data resets when you close this tab.
      </footer>
    </div>
  );
}
