'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ScientistCard from '@/components/rankings/ScientistCard';
import type { OAField, OASubfield, RankedScientist } from '@/types/rankings';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_RANGE = Array.from({ length: CURRENT_YEAR - 2018 }, (_, i) => 2019 + i);

type DataSource = 'openalex' | 'stanford' | 'snapshot';

interface RankingsResponse {
  scientists: RankedScientist[];
  total: number;
  page: number;
  dataSource: DataSource;
  year: number;
  capturedAt?: string;
}

const SOURCE_INFO: Record<DataSource, { label: string; desc: string; cls: string }> = {
  stanford: {
    label: 'Stanford Official',
    desc: 'Data from the Ioannidis et al. standardised citation metrics dataset (Elsevier)',
    cls: 'bg-red-50 border-red-200 text-red-700',
  },
  snapshot: {
    label: 'OpenAlex Snapshot',
    desc: 'Point-in-time snapshot captured from OpenAlex',
    cls: 'bg-amber-50 border-amber-200 text-amber-700',
  },
  openalex: {
    label: 'OpenAlex Live',
    desc: 'Live citation data from OpenAlex — reflects current counts, not a historical snapshot',
    cls: 'bg-green-50 border-green-200 text-green-700',
  },
};

export default function RankingsPage() {
  const [fields, setFields] = useState<OAField[]>([]);
  const [subfields, setSubfields] = useState<OASubfield[]>([]);
  const [selectedField, setSelectedField] = useState<OAField | null>(null);
  const [selectedSubfield, setSelectedSubfield] = useState<OASubfield | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [snapshotYears, setSnapshotYears] = useState<number[]>([]);

  const [scientists, setScientists] = useState<RankedScientist[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dataSource, setDataSource] = useState<DataSource>('openalex');
  const [capturedAt, setCapturedAt] = useState<string | null>(null);

  const [loadingFields, setLoadingFields] = useState(true);
  const [loadingSubfields, setLoadingSubfields] = useState(false);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load fields on mount
  useEffect(() => {
    fetch('/api/rankings/fields')
      .then((r) => r.json())
      .then((d) => {
        const list: OAField[] = d.fields ?? [];
        setFields(list);
        if (list.length) setSelectedField(list[0]);
      })
      .catch(() => setError('Failed to load fields'))
      .finally(() => setLoadingFields(false));
  }, []);

  // Load subfields when field changes
  useEffect(() => {
    if (!selectedField) return;
    setLoadingSubfields(true);
    setSubfields([]);
    setSelectedSubfield(null);
    fetch(`/api/rankings/subfields?fieldId=${encodeURIComponent(selectedField.id)}&fieldName=${encodeURIComponent(selectedField.display_name)}`)
      .then((r) => r.json())
      .then((d) => {
        const list: OASubfield[] = d.subfields ?? [];
        setSubfields(list);
        if (list.length) setSelectedSubfield(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingSubfields(false));
  }, [selectedField]);

  // Load snapshot years when subfield changes
  useEffect(() => {
    if (!selectedSubfield) return;
    fetch(`/api/rankings/snapshot?subfieldId=${encodeURIComponent(selectedSubfield.id)}`)
      .then((r) => r.json())
      .then((d) => setSnapshotYears(d.years ?? []))
      .catch(() => setSnapshotYears([]));
  }, [selectedSubfield]);

  // Fetch rankings
  const fetchRankings = useCallback(
    async (pageNum: number, append = false) => {
      if (!selectedSubfield) return;
      append ? setLoadingMore(true) : setLoadingRankings(true);
      setError(null);

      const params = new URLSearchParams({
        subfieldId: selectedSubfield.id,
        subfieldName: selectedSubfield.display_name,
        fieldId: selectedField?.id ?? '',
        fieldName: selectedField?.display_name ?? '',
        year: String(selectedYear),
        page: String(pageNum),
      });

      try {
        const res = await fetch(`/api/rankings?${params}`);
        if (!res.ok) throw new Error('Request failed');
        const data: RankingsResponse = await res.json();
        setScientists((prev) => (append ? [...prev, ...data.scientists] : data.scientists));
        setTotal(data.total);
        setPage(pageNum);
        setDataSource(data.dataSource);
        setCapturedAt(data.capturedAt ?? null);
      } catch {
        setError('Failed to load rankings. Please try again.');
      } finally {
        setLoadingRankings(false);
        setLoadingMore(false);
      }
    },
    [selectedSubfield, selectedField, selectedYear]
  );

  useEffect(() => {
    if (selectedSubfield) {
      setPage(1);
      fetchRankings(1, false);
    }
  }, [selectedSubfield, selectedYear, fetchRankings]);

  async function captureSnapshot() {
    if (!selectedSubfield || !selectedField) return;
    setCapturing(true);
    setCaptureSuccess(false);
    try {
      const res = await fetch('/api/rankings/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subfieldId: selectedSubfield.id,
          subfieldName: selectedSubfield.display_name,
          fieldId: selectedField.id,
          fieldName: selectedField.display_name,
          year: selectedYear,
        }),
      });
      if (!res.ok) throw new Error('Snapshot failed');
      setCaptureSuccess(true);
      setSnapshotYears((prev) => [...new Set([...prev, selectedYear])].sort());
      fetchRankings(1, false);
      setTimeout(() => setCaptureSuccess(false), 3000);
    } catch {
      setError('Failed to capture snapshot.');
    } finally {
      setCapturing(false);
    }
  }

  const hasMore = scientists.length < total;
  const yearHasData = (y: number) => snapshotYears.includes(y);
  const srcInfo = SOURCE_INFO[dataSource];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
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
            <Link href="/" className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
              Search
            </Link>
            <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50">
              Rankings
            </span>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Top Scientists by Citations</h1>
          <p className="text-slate-500 text-sm">
            Browse top-cited researchers by field and subfield. Based on{' '}
            <a href="https://elsevier.digitalcommonsdata.com/datasets/btchxktzyw/8"
              target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline">
              Stanford 2% methodology
            </a>
            {' '}· Data via OpenAlex (live) or uploaded Stanford datasets.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 space-y-4">
          {/* Year selector */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
              Year
            </label>
            <div className="flex flex-wrap gap-1.5">
              {YEAR_RANGE.map((y) => {
                const hasSnap = yearHasData(y);
                const isSelected = selectedYear === y;
                return (
                  <button
                    key={y}
                    onClick={() => setSelectedYear(y)}
                    className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {y}
                    {hasSnap && (
                      <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-white ${
                        isSelected ? 'bg-white' : 'bg-blue-500'
                      }`} title="Snapshot available" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field + Subfield selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                Field
                {fields.length > 0 && (
                  <span className="ml-1 font-normal normal-case text-slate-400">({fields.length})</span>
                )}
              </label>
              <select
                value={selectedField?.id ?? ''}
                onChange={(e) => {
                  const f = fields.find((x) => x.id === e.target.value) ?? null;
                  setSelectedField(f);
                }}
                disabled={loadingFields}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              >
                {loadingFields ? (
                  <option>Loading fields…</option>
                ) : (
                  fields.map((f) => (
                    <option key={f.id} value={f.id}>{f.display_name}</option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                Subfield
                {subfields.length > 0 && (
                  <span className="ml-1 font-normal normal-case text-slate-400">({subfields.length})</span>
                )}
              </label>
              <select
                value={selectedSubfield?.id ?? ''}
                onChange={(e) => {
                  const s = subfields.find((x) => x.id === e.target.value) ?? null;
                  setSelectedSubfield(s);
                }}
                disabled={loadingSubfields || subfields.length === 0}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              >
                {loadingSubfields ? (
                  <option>Loading subfields…</option>
                ) : (
                  subfields.map((s) => (
                    <option key={s.id} value={s.id}>{s.display_name}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Snapshot action */}
          {selectedSubfield && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                {yearHasData(selectedYear)
                  ? `Snapshot saved for ${selectedYear} — click to refresh`
                  : `No snapshot for ${selectedYear} — save current OpenAlex data as a dated snapshot`}
              </p>
              <button
                onClick={captureSnapshot}
                disabled={capturing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  captureSuccess
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                }`}
              >
                {capturing ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Capturing…
                  </>
                ) : captureSuccess ? (
                  <>✓ Saved!</>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Capture {selectedYear} snapshot
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Data source banner */}
        {!loadingRankings && scientists.length > 0 && (
          <div className={`rounded-xl border px-4 py-2.5 mb-4 flex items-start gap-2 text-xs ${srcInfo.cls}`}>
            <span className="font-bold flex-shrink-0">{srcInfo.label}</span>
            <span>{srcInfo.desc}</span>
            {capturedAt && (
              <span className="ml-auto flex-shrink-0 opacity-70">
                Captured {new Date(capturedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {/* Results header */}
        {!loadingRankings && scientists.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">
              {selectedSubfield?.display_name}
              {selectedField && (
                <span className="text-slate-400 font-normal"> · {selectedField.display_name}</span>
              )}
              <span className="ml-2 text-slate-400 font-normal">{total.toLocaleString()} scientists</span>
            </h2>
            <span className="text-xs text-slate-400">Sorted by citations</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Skeleton */}
        {loadingRankings && (
          <div className="space-y-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse h-24" />
            ))}
          </div>
        )}

        {/* Results */}
        {!loadingRankings && (
          <div className="space-y-2.5">
            {scientists.map((s) => (
              <ScientistCard key={`${s.openAlexId}-${s.rank}`} scientist={s} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loadingRankings && !loadingSubfields && scientists.length === 0 && !error && selectedSubfield && (
          <div className="text-center py-16 text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-200">
            <p className="text-2xl mb-2">🔍</p>
            <p>No scientists found for <strong>{selectedSubfield.display_name}</strong>.</p>
            <p className="mt-1 text-xs">Try a different subfield or check your filters.</p>
          </div>
        )}

        {/* Load more */}
        {hasMore && !loadingRankings && scientists.length > 0 && (
          <button
            onClick={() => fetchRankings(page + 1, true)}
            disabled={loadingMore}
            className="mt-4 w-full py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Loading more…' : `Load more scientists (${(total - scientists.length).toLocaleString()} remaining)`}
          </button>
        )}
      </main>

      <footer className="mt-16 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Data via{' '}
        <a href="https://openalex.org" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">OpenAlex</a>
        {' '}(live/snapshots) and{' '}
        <a href="https://elsevier.digitalcommonsdata.com/datasets/btchxktzyw/8" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">
          Stanford/Elsevier
        </a>
        {' '}(official releases). Taxonomy: OpenAlex ASJC (26 fields, 252 subfields) for live data · Science-Metrix (22 fields, 174 subfields) for official Stanford files.
      </footer>
    </div>
  );
}
