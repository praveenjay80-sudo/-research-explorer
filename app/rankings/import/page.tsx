'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { countryFlag, formatCitations } from '@/lib/rankings';

// ── Column glossary (plain-English explanations for all Stanford columns) ──
const COLUMN_GUIDE: Record<string, { label: string; explain: string }> = {
  authfull:          { label: 'Full name', explain: "The scientist's full name as it appears in their published papers." },
  inst_name:         { label: 'Institution', explain: 'The last university or research centre where this person worked.' },
  cntry:             { label: 'Country', explain: 'Two-letter country code of their institution (e.g. "us" = United States, "gb" = United Kingdom).' },
  np6023:            { label: 'Papers (career)', explain: 'Total number of papers published in their career (from 1960 to the dataset year). Later datasets use variants like np6022, np2223.' },
  firstyr:           { label: 'First year', explain: 'The year they published their very first paper.' },
  lastyr:            { label: 'Last year', explain: 'The year they published their most recent paper included in this dataset.' },
  c:                 { label: 'Total citations', explain: 'Every time another paper references their work, that is one citation. This is the lifetime total — a score of 10,000 means other scientists have cited their papers 10,000 times.' },
  h23:               { label: 'H-index', explain: 'If a scientist has an h-index of 40, it means they have 40 papers that have each been cited at least 40 times. It measures both how much they publish AND how influential each paper is. Average professor ≈ 15–25; top global researcher ≈ 60+.' },
  hm_s:              { label: 'Hm-index', explain: 'A refined version of the h-index that avoids inflating the score for scientists who are one of many co-authors on a paper. More fair for collaborative fields.' },
  nps:               { label: 'Solo/first/last author papers', explain: 'Papers where they are the only author, the first author, or the last author. These are typically the papers they contributed to most heavily.' },
  ncs:               { label: 'Citations to solo papers', explain: 'Total citations received by just the papers where they are sole, first, or last author.' },
  cpsf:              { label: 'First/sole author papers', explain: 'Papers where they are the only author or the first-listed author (usually the person who did the most work).' },
  ncsf:              { label: 'Citations to first-author papers', explain: 'Citations to papers where they led the research as sole or first author.' },
  npsfl:             { label: 'First/last author papers', explain: 'Papers where they were the first or last author. In many fields, the last author is the senior supervisor who directed the project.' },
  ncsfl:             { label: 'Citations to first/last author papers', explain: 'Citations received specifically by the papers where they held a lead role (first or last author).' },
  self_share:        { label: 'Self-citation %', explain: 'Fraction of their citations that come from their own papers citing their own earlier work. High self-citation (e.g. >40%) can inflate citation counts. Lower is generally better.' },
  author_pos:        { label: 'Author position', explain: "Their typical position in author lists: 1 = first author (led the work), 2+ = middle, last = senior supervisor. In many fields the last author is the most senior." },
  'sm-subfield-1':   { label: 'Subfield', explain: 'Their main research subfield according to the Stanford/Science-Metrix classification (one of ~174 subfields, e.g. "Oncology", "Artificial Intelligence").' },
  'sm-field':        { label: 'Field', explain: 'Their broad research field (one of 22 top-level fields, e.g. "Medicine", "Computer Science").' },
  'sm-subfield-1-frac': { label: 'Subfield fraction', explain: 'What fraction of their papers belong to this subfield (0 to 1). A score of 0.8 means 80% of their work is in this subfield.' },
  rank_ns:           { label: 'Rank by ns', explain: 'Their rank among all scientists in their subfield when sorted by the normalised score (ns). Rank 1 = most impactful in their subfield.' },
  ns:                { label: 'Normalised score (ns)', explain: 'Citations adjusted for how many papers are typically cited in their field and year. A score of 1.0 means average for their field; 5.0 means 5× the field average. Fairer than raw citations for comparing across fields.' },
  'ns%':             { label: 'Percentile (ns)', explain: "Their percentile in their field by normalised citation score. 99 means they are in the top 1% of all scientists in their field — extremely rare and influential." },
  cns23:             { label: 'C-score', explain: 'A composite score combining multiple citation metrics (citations, h-index, normalised score). Higher is better. This is the main ranking metric Stanford uses for the top-2% list.' },
  // Table 2 columns
  '#Auth':           { label: 'Total authors', explain: 'Total number of active scientists in this field worldwide.' },
  '#Auth top 100k (ns)': { label: 'Top 100k by ns', explain: 'Scientists in this field who rank in the global top 100,000 when ranked by normalised citation score.' },
  '% in 100k (ns)':  { label: '% top 100k (ns)', explain: 'What percentage of this field\'s scientists are in the global top 100,000 by normalised score.' },
  '#Auth top 100k':  { label: 'Top 100k (raw)', explain: 'Scientists in this field in the global top 100,000 by raw career citations.' },
  '% in 100k':       { label: '% top 100k (raw)', explain: 'Percentage of this field\'s scientists in the global top 100,000 by raw citations.' },
  '#Auth in top-list': { label: 'In Stanford top-list', explain: 'Scientists from this field who appear in the Stanford top-2% list.' },
  '% in top-list':   { label: '% in top-list', explain: 'Percentage of this field\'s scientists who made the Stanford top-2% list.' },
  'Cites@25':        { label: 'Citations at 25th percentile', explain: '25% of scientists in this field have fewer than this many career citations.' },
  'Cites@50':        { label: 'Median citations', explain: 'The median (middle) career citation count for scientists in this field.' },
  'Cites@95':        { label: 'Citations at 95th percentile', explain: 'Only the top 5% of scientists in this field have more citations than this. Very high bar.' },
  'Cites@99':        { label: 'Citations at 99th percentile', explain: 'Only the top 1% of scientists in this field exceed this citation count. World-elite level.' },
  'c@50':            { label: 'Median c-score', explain: 'The median composite c-score for scientists in this field.' },
  'c@99':            { label: 'C-score at 99th percentile', explain: 'The c-score threshold for the top 1% of scientists in this field.' },
  'top-list self%@95': { label: 'Self-cite % (95th)', explain: 'Self-citation rate at the 95th percentile of the top-list scientists in this field.' },
  'top-list cprat@95': { label: 'Citations/paper (95th)', explain: 'Citations-per-paper ratio at the 95th percentile. Fields with high values tend to have intensely-cited landmark papers.' },
};

// ── Column detection aliases ──────────────────────────────────────────────
const COL: Record<string, string[]> = {
  name:         ['authfull', 'author', 'name', 'full name', 'author name'],
  institution:  ['inst_name', 'institution', 'affiliation', 'organization', 'inst', 'university'],
  country:      ['cntry', 'country', 'country_code', 'ctry'],
  field:        ['sm-field', 'sm_field', 'field', 'sm field', 'discipline', 'domain'],
  subfield:     ['sm-subfield-1', 'sm_subfield_1', 'subfield', 'sub-field', 'sm subfield 1', 'subfield1'],
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

// Table 2 columns (field stats)
const T2_COL: Record<string, string[]> = {
  domain:       ['domain'],
  field:        ['field'],
  totalAuth:    ['#auth'],
  top100kNs:    ['#auth top 100k (ns)', '#auth top 100k(ns)'],
  pct100kNs:    ['% in 100k (ns)', '% in 100k(ns)'],
  top100k:      ['#auth top 100k'],
  pct100k:      ['% in 100k'],
  topList:      ['#auth in top-list'],
  pctTopList:   ['% in top-list'],
  cites25:      ['cites@25'],
  cites50:      ['cites@50'],
  cites75:      ['cites@75'],
  cites90:      ['cites@90'],
  cites95:      ['cites@95'],
  cites99:      ['cites@99'],
  c25:          ['c@25'],
  c50:          ['c@50'],
  c75:          ['c@75'],
  c90:          ['c@90'],
  c95:          ['c@95'],
  c99:          ['c@99'],
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
  totalAuth: number; top100kNs: number; pct100kNs: number;
  top100k: number; pct100k: number; topList: number; pctTopList: number;
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
}

function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) ?? []).length;
  return tabs > 0 ? '\t' : ',';
}

function parseLine(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t').map((c) => c.trim());
  const cells: string[] = [];
  let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function findCol(lower: string[], key: string, aliases: string[]): number {
  for (const alias of aliases) {
    const idx = lower.findIndex((h) => h === alias);
    if (idx !== -1) return idx;
  }
  for (const alias of aliases) {
    const idx = lower.findIndex((h) => h.startsWith(alias) || h.includes(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

function isTable2(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase().trim());
  return lower.some((h) => h === 'domain') && lower.some((h) => h === '#auth' || h.startsWith('#auth'));
}

function parseData(raw: string): {
  rows: ParsedRow[]; fieldStats: FieldStatRow[];
  type: 'scientists' | 'fieldstats'; warnings: string[];
} {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], fieldStats: [], type: 'scientists', warnings: ['Need at least a header row and one data row.'] };

  const delim = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delim);
  const lower = headers.map((h) => h.toLowerCase().trim());
  const warnings: string[] = [];

  // ── Table 2 (field statistics) ────────────────────────────────────────────
  if (isTable2(headers)) {
    const c2: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(T2_COL)) {
      c2[key] = findCol(lower, key, aliases);
    }
    const fieldStats: FieldStatRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseLine(lines[i], delim);
      if (cells.length < 3) continue;
      const get = (k: string) => (c2[k] >= 0 ? cells[c2[k]]?.trim() ?? '' : '');
      const num = (k: string) => { const v = get(k).replace(/,/g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      fieldStats.push({
        domain: get('domain'), field: get('field'),
        totalAuth: num('totalAuth'), top100kNs: num('top100kNs'), pct100kNs: num('pct100kNs'),
        top100k: num('top100k'), pct100k: num('pct100k'), topList: num('topList'), pctTopList: num('pctTopList'),
        cites50: num('cites50'), cites95: num('cites95'), cites99: num('cites99'),
        c50: num('c50'), c99: num('c99'),
      });
    }
    return { rows: [], fieldStats, type: 'fieldstats', warnings };
  }

  // ── Table 1 (individual scientists) ──────────────────────────────────────
  const cols: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(COL)) {
    cols[key] = findCol(lower, key, aliases);
  }
  const missing = ['name', 'field', 'citations'].filter((k) => cols[k] === -1);
  if (missing.length) {
    warnings.push(`Could not find columns: ${missing.join(', ')}. Detected headers: ${headers.slice(0, 14).join(', ')}${headers.length > 14 ? '…' : ''}`);
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i], delim);
    if (cells.length < 2) continue;
    const get = (k: string) => (cols[k] >= 0 ? cells[cols[k]]?.trim() ?? '' : '');
    const num = (k: string) => { const v = get(k).replace(/,/g, ''); const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    rows.push({
      name: get('name') || `Row ${i}`, institution: get('institution') || 'Unknown Institution',
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
    });
  }
  return { rows, fieldStats: [], type: 'scientists', warnings };
}

const RANK_COLORS = ['bg-yellow-400 text-yellow-900', 'bg-slate-300 text-slate-700', 'bg-amber-600 text-white'];

function ColGuide() {
  const [open, setOpen] = useState(false);
  const groups = [
    {
      title: 'Who they are',
      cols: ['authfull', 'inst_name', 'cntry', 'firstyr', 'lastyr', 'author_pos'],
    },
    {
      title: 'How much they published',
      cols: ['np6023', 'nps', 'cpsf', 'npsfl'],
    },
    {
      title: 'How influential they are',
      cols: ['c', 'h23', 'hm_s', 'ncs', 'ncsf', 'ncsfl', 'self_share'],
    },
    {
      title: 'Field classification',
      cols: ['sm-field', 'sm-subfield-1', 'sm-subfield-1-frac'],
    },
    {
      title: 'Rankings & scores',
      cols: ['rank_ns', 'ns', 'ns%', 'cns23'],
    },
    {
      title: 'Field statistics columns (Table 2)',
      cols: ['#Auth', '% in top-list', 'Cites@50', 'Cites@95', 'Cites@99', 'c@50', 'c@99', 'top-list cprat@95'],
    },
  ];

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-blue-800 hover:bg-blue-100 transition-colors"
      >
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
                      <span className="flex-shrink-0 font-mono bg-white border border-blue-200 rounded px-1.5 py-0.5 text-blue-700 min-w-28 text-center">
                        {key}
                      </span>
                      <div>
                        <span className="font-semibold text-slate-700">{info.label}: </span>
                        <span className="text-slate-600">{info.explain}</span>
                      </div>
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
          name: scientist.name,
          institution: scientist.institution,
          country: scientist.country,
          field: scientist.field,
          subfield: scientist.subfield,
          citations: scientist.citations,
          hIndex: scientist.hIndex,
          works: scientist.works,
          cScore: scientist.cScore,
          firstYear: scientist.firstYear,
          lastYear: scientist.lastYear,
          selfShare: scientist.selfShare,
        }),
      });
      const data = await res.json();
      if (data.explanation) { setText(data.explanation); setStatus('done'); }
      else setStatus('error');
    } catch { setStatus('error'); }
  }

  if (status === 'idle') {
    return (
      <button onClick={generate} className="mt-2 text-xs px-2.5 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors font-medium">
        ✦ Explain this scientist (plain English)
      </button>
    );
  }
  if (status === 'loading') {
    return <p className="mt-2 text-xs text-slate-400 animate-pulse">Generating explanation…</p>;
  }
  if (status === 'error') {
    return <p className="mt-2 text-xs text-red-500">Could not generate explanation. Check that ANTHROPIC_API_KEY is set.</p>;
  }
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
  const [showPaste, setShowPaste] = useState(true);
  const [raw, setRaw] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [selectedField, setSelectedField] = useState('');
  const [selectedSubfield, setSelectedSubfield] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'citations' | 'hIndex' | 'works' | 'cScore' | 'rank'>('citations');

  const activeDataset = datasets.find((d) => d.year === activeYear);
  const activeRows: ParsedRow[] = activeDataset?.rows ?? [];
  const activeStats: FieldStatRow[] = activeDataset?.fieldStats ?? [];

  function handleParse() {
    const { rows, fieldStats, type, warnings: w } = parseData(raw);
    setWarnings(w);
    if (rows.length === 0 && fieldStats.length === 0) return;

    const yr = yearInput.trim() || `Import ${datasets.length + 1}`;
    const fields = new Set([
      ...rows.map((r) => r.field),
      ...fieldStats.map((r) => r.field),
    ].filter(Boolean));
    const subs = new Set(rows.map((r) => r.subfield).filter(Boolean));
    const ds: Dataset = {
      year: yr, type,
      rows: type === 'scientists' ? rows : undefined,
      fieldStats: type === 'fieldstats' ? fieldStats : undefined,
      rowCount: rows.length || fieldStats.length,
      fieldCount: fields.size,
      subfieldCount: subs.size,
      importedAt: new Date().toISOString(),
    };
    setDatasets((prev) => [...prev.filter((d) => d.year !== yr), ds].sort((a, b) => a.year.localeCompare(b.year)));
    setActiveYear(yr);
    setShowPaste(false);
    setRaw(''); setYearInput(''); setSelectedField(''); setSelectedSubfield(''); setSearch('');
  }

  function removeDataset(yr: string) {
    const remaining = datasets.filter((d) => d.year !== yr);
    setDatasets(remaining);
    if (activeYear === yr) {
      setActiveYear(remaining[0]?.year ?? '');
      if (remaining.length === 0) setShowPaste(true);
    }
  }

  const fields = useMemo(() => [...new Set(activeRows.map((r) => r.field).filter(Boolean))].sort(), [activeRows]);
  const subfields = useMemo(() => {
    return [...new Set(
      activeRows.filter((r) => !selectedField || r.field === selectedField).map((r) => r.subfield).filter(Boolean)
    )].sort();
  }, [activeRows, selectedField]);

  const filtered = useMemo(() => {
    let out = activeRows;
    if (selectedField) out = out.filter((r) => r.field === selectedField);
    if (selectedSubfield) out = out.filter((r) => r.subfield === selectedSubfield);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.institution.toLowerCase().includes(q) ||
        r.subfield.toLowerCase().includes(q) ||
        r.field.toLowerCase().includes(q)
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-lg hidden sm:block">Research Explorer</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/" className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">Search</Link>
            <Link href="/rankings" className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">Rankings</Link>
            <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50">Stanford Import</span>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Stanford Rankings — Paste &amp; Browse</h1>
          <p className="text-slate-500 text-sm">
            Open the Stanford dataset Excel, select all rows including the header row, copy (Ctrl+C), and paste below.
            Works with any year and both Table 1 (individual scientists) and Table 2 (field statistics).
            Paste multiple years — each gets its own tab.
          </p>
        </div>

        {/* Year tabs */}
        {datasets.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {datasets.map((d) => (
              <div key={d.year} className="flex items-center">
                <button
                  onClick={() => { setActiveYear(d.year); setShowPaste(false); setSelectedField(''); setSelectedSubfield(''); setSearch(''); }}
                  className={`px-4 py-2 rounded-l-lg text-sm font-semibold border transition-colors ${
                    activeYear === d.year ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {d.year}
                  <span className={`ml-1.5 text-xs font-normal ${activeYear === d.year ? 'text-red-200' : 'text-slate-400'}`}>
                    {d.type === 'fieldstats' ? 'Field stats' : `${d.rowCount.toLocaleString()} scientists`}
                  </span>
                </button>
                <button
                  onClick={() => removeDataset(d.year)}
                  className="px-2 py-2 rounded-r-lg text-xs border-y border-r border-slate-200 bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Remove"
                >×</button>
              </div>
            ))}
            <button
              onClick={() => { setShowPaste(true); setActiveYear(''); }}
              className="px-3 py-2 rounded-lg text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              + Add year
            </button>
          </div>
        )}

        {/* Paste panel */}
        {showPaste && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-start gap-4 flex-wrap">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Year label</label>
                <input
                  type="text" value={yearInput} onChange={(e) => setYearInput(e.target.value)}
                  placeholder="e.g. 2023"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 leading-relaxed">
                <strong className="text-slate-700 block mb-1">How to copy from Excel:</strong>
                1. Click cell A1 (header row) → Press <kbd className="bg-white border border-slate-200 rounded px-1">Ctrl+Shift+End</kbd> → Press <kbd className="bg-white border border-slate-200 rounded px-1">Ctrl+C</kbd><br />
                2. Click the textarea below → Press <kbd className="bg-white border border-slate-200 rounded px-1">Ctrl+V</kbd><br />
                Supports both <strong>Table 1</strong> (individual scientists: authfull, c, h23…) and <strong>Table 2</strong> (field stats: Domain, Field, #Auth…)
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                Paste data here (tab-separated from Excel, with header row)
              </label>
              <textarea
                ref={textareaRef}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"authfull\tinst_name\tcntry\tsm-field\tsm-subfield-1\tc\th23\tnp6023\tcns23\tfirstyr\tlastyr\nSmith, John\tMIT\tus\tMedicine\tOncology\t12500\t45\t180\t2.31\t1995\t2023"}
                rows={12}
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                spellCheck={false}
              />
              <p className="mt-1 text-xs text-slate-400">
                {raw ? `${raw.split(/\r?\n/).filter((l) => l.trim()).length - 1} data rows detected` : 'Paste from Excel — TSV (tab-separated) or CSV both work'}
              </p>
            </div>

            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                {warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleParse}
                disabled={!raw.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Parse &amp; View Rankings
              </button>
              {datasets.length > 0 && (
                <button
                  onClick={() => { setShowPaste(false); setActiveYear(datasets[datasets.length - 1].year); }}
                  className="px-4 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Field stats (Table 2) view ── */}
        {activeDataset?.type === 'fieldstats' && !showPaste && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-6">
                <div><p className="text-2xl font-bold text-slate-900">{activeStats.length}</p><p className="text-xs text-slate-500">fields</p></div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">Stanford {activeDataset.year} · Field Statistics</span>
                </div>
              </div>
            </div>

            <ColGuide />

            <div>
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by field name…"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              />
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Domain</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Field</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600" title="Total authors in field">#Authors</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600" title="In Stanford top-2% list">In top-list</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600" title="% in top-list">% top-list</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600" title="Median career citations">Median cites</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600" title="99th percentile citations">99th %ile cites</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600" title="Median c-score">Median c-score</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600" title="99th percentile c-score">99th %ile c-score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStats.map((row, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500">{row.domain}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{row.field}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.totalAuth.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.topList.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-blue-700">{row.pctTopList.toFixed(1)}%</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatCitations(row.cites50)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCitations(row.cites99)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.c50.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.c99.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Individual scientists (Table 1) view ── */}
        {activeDataset?.type === 'scientists' && !showPaste && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-6">
                <div><p className="text-2xl font-bold text-slate-900">{activeDataset.rowCount.toLocaleString()}</p><p className="text-xs text-slate-500">scientists</p></div>
                <div><p className="text-2xl font-bold text-slate-900">{activeDataset.fieldCount}</p><p className="text-xs text-slate-500">fields</p></div>
                <div><p className="text-2xl font-bold text-slate-900">{activeDataset.subfieldCount}</p><p className="text-xs text-slate-500">subfields</p></div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-slate-400">Imported {new Date(activeDataset.importedAt).toLocaleTimeString()}</span>
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">Stanford {activeDataset.year}</span>
                </div>
              </div>
            </div>

            <ColGuide />

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Field <span className="font-normal normal-case text-slate-400">({fields.length})</span>
                  </label>
                  <select
                    value={selectedField}
                    onChange={(e) => { setSelectedField(e.target.value); setSelectedSubfield(''); }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All fields ({activeDataset.fieldCount})</option>
                    {fields.map((f) => (
                      <option key={f} value={f}>{f} ({activeRows.filter((r) => r.field === f).length.toLocaleString()})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Subfield <span className="font-normal normal-case text-slate-400">({subfields.length})</span>
                  </label>
                  <select
                    value={selectedSubfield}
                    onChange={(e) => setSelectedSubfield(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All subfields</option>
                    {subfields.map((s) => (
                      <option key={s} value={s}>
                        {s} ({activeRows.filter((r) => r.subfield === s && (!selectedField || r.field === selectedField)).length.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-48">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Search</label>
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, institution, subfield…"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Sort by</label>
                  <select
                    value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
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
                {selectedSubfield ? <>{selectedSubfield}{selectedField && <span className="text-slate-400 font-normal"> · {selectedField}</span>}</>
                  : selectedField ? selectedField : 'All scientists'}
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
                const activeYears = s.firstYear && s.lastYear ? `${s.firstYear}–${s.lastYear}` : s.lastYear ? `–${s.lastYear}` : null;
                return (
                  <div key={`${s.name}-${i}`} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm hover:border-slate-300 transition-all">
                    <div className="flex items-start gap-3">
                      <span className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${rankCls}`}>
                        {rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{s.name}</h3>
                          <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">
                            Stanford {activeDataset.year}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {flag && <span className="mr-1">{flag}</span>}
                          {s.institution}
                        </p>
                        {(s.field || s.subfield) && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {s.subfield && <span className="font-medium text-slate-500">{s.subfield}</span>}
                            {s.subfield && s.field && <span> · </span>}
                            {s.field}
                          </p>
                        )}
                        {/* Primary metrics */}
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="flex items-center gap-0.5 text-xs text-blue-700 font-semibold">
                            <span className="text-blue-500">★</span>
                            <span>{formatCitations(s.citations)}</span>
                            <span className="text-blue-400 font-normal">citations</span>
                          </span>
                          <span className="text-xs text-slate-600">
                            <span className="font-semibold">h{s.hIndex}</span>
                            <span className="text-slate-400"> h-index</span>
                          </span>
                          <span className="text-xs text-slate-600">
                            <span className="font-semibold">{formatCitations(s.works)}</span>
                            <span className="text-slate-400"> works</span>
                          </span>
                          {s.cScore !== undefined && s.cScore > 0 && (
                            <span className="text-xs text-slate-600">
                              <span className="font-semibold">{s.cScore.toFixed(3)}</span>
                              <span className="text-slate-400"> c-score</span>
                            </span>
                          )}
                          {s.hmIndex !== undefined && s.hmIndex > 0 && (
                            <span className="text-xs text-slate-600">
                              <span className="font-semibold">{s.hmIndex.toFixed(1)}</span>
                              <span className="text-slate-400"> hm-index</span>
                            </span>
                          )}
                        </div>
                        {/* Secondary metrics */}
                        {(activeYears || s.selfShare !== undefined || s.rank !== undefined || s.nsPercentile !== undefined || s.subfieldFrac !== undefined) && (
                          <div className="flex items-center gap-4 mt-1 flex-wrap">
                            {activeYears && <span className="text-xs text-slate-400"><span className="text-slate-500">{activeYears}</span> active</span>}
                            {s.selfShare !== undefined && (
                              <span className="text-xs text-slate-400">
                                <span className="text-slate-500">{(s.selfShare * 100).toFixed(0)}%</span> self-cite
                              </span>
                            )}
                            {s.nsPercentile !== undefined && (
                              <span className="text-xs text-slate-400">
                                top <span className="text-slate-500 font-medium">{(100 - s.nsPercentile).toFixed(0)}%</span> in field
                              </span>
                            )}
                            {s.rank !== undefined && s.rank > 0 && (
                              <span className="text-xs text-slate-400">
                                subfield rank <span className="text-slate-500 font-medium">#{s.rank}</span>
                              </span>
                            )}
                            {s.subfieldFrac !== undefined && s.subfieldFrac > 0 && (
                              <span className="text-xs text-slate-400">
                                <span className="text-slate-500">{(s.subfieldFrac * 100).toFixed(0)}%</span> of work in this subfield
                              </span>
                            )}
                            {s.authorPos && (
                              <span className="text-xs text-slate-400">
                                author pos <span className="text-slate-500">{s.authorPos}</span>
                              </span>
                            )}
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
              <p className="text-center text-sm text-slate-400 py-4">
                Showing top 250 of {filtered.length.toLocaleString()} — use the subfield filter to narrow down.
              </p>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                <p className="text-2xl mb-2">🔍</p>
                <p>No results match your filters.</p>
              </div>
            )}
          </>
        )}

        {datasets.length === 0 && !showPaste && (
          <div className="text-center py-16 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400">
            <p className="text-3xl mb-3">📋</p>
            <p className="font-semibold text-slate-600">No data imported yet</p>
            <button onClick={() => setShowPaste(true)} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Paste data now
            </button>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Data is parsed in your browser — nothing is uploaded to any server. Data resets when you close this tab.
      </footer>
    </div>
  );
}
