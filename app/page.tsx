'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import PaperList from '@/components/PaperList';
import ConceptMap from '@/components/ConceptMap';
import { Paper, ConceptGraph } from '@/types';

const ALL_SOURCES = [
  { id: 'semantic-scholar', label: 'Semantic Scholar', short: 'S2',         color: 'bg-orange-100 text-orange-700 border-orange-200',  activeColor: 'bg-orange-500 text-white border-orange-500',  needsKey: false },
  { id: 'openalex',         label: 'OpenAlex',         short: 'OpenAlex',   color: 'bg-green-100 text-green-700 border-green-200',     activeColor: 'bg-green-600 text-white border-green-600',    needsKey: false },
  { id: 'pubmed',           label: 'PubMed',           short: 'PubMed',     color: 'bg-blue-100 text-blue-700 border-blue-200',        activeColor: 'bg-blue-600 text-white border-blue-600',      needsKey: true },
  { id: 'arxiv',            label: 'arXiv',            short: 'arXiv',      color: 'bg-red-100 text-red-700 border-red-200',           activeColor: 'bg-red-600 text-white border-red-600',        needsKey: true },
  { id: 'europe-pmc',       label: 'Europe PMC',       short: 'Europe PMC', color: 'bg-violet-100 text-violet-700 border-violet-200',  activeColor: 'bg-violet-600 text-white border-violet-600',  needsKey: true },
  { id: 'eric',             label: 'ERIC',             short: 'ERIC',         color: 'bg-teal-100 text-teal-700 border-teal-200',          activeColor: 'bg-teal-600 text-white border-teal-600',        needsKey: true },
  { id: 'google-scholar',   label: 'Google Scholar',   short: 'Scholar',      color: 'bg-sky-100 text-sky-700 border-sky-200',             activeColor: 'bg-sky-600 text-white border-sky-600',          needsKey: true },
];

type SourceId = typeof ALL_SOURCES[number]['id'];

const EXAMPLE_TOPICS = [
  'transformer neural networks',
  'CRISPR gene editing',
  'large language models',
  'quantum computing',
  'climate change mitigation',
];

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: 'bg-red-50 text-red-600 border-red-100',
    badge: 'Featured',
    badgeCls: 'bg-red-100 text-red-700',
    title: 'Stanford Top 2% Rankings',
    desc: 'Import the official Stanford/Elsevier dataset (any year 2019–2026) and browse the world\'s most-cited scientists by field and subfield. Supports both Table 1 (individual scientists) and Table 2 (field statistics).',
    bullets: [
      'Upload .xlsx or .csv directly — no copy-paste needed',
      'Filter by 22 fields and 174 subfields',
      'Column guide explaining every metric in plain English',
      'AI-generated scientist profiles with key contributions',
    ],
    href: '/rankings/import',
    cta: 'Open Stanford Rankings →',
    ctaCls: 'bg-red-600 hover:bg-red-700 text-white',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    color: 'bg-blue-50 text-blue-600 border-blue-100',
    badge: null,
    badgeCls: '',
    title: 'Academic Paper Search',
    desc: 'Search millions of papers and books from Semantic Scholar and OpenAlex. Results are sorted by citation count with an interactive concept map showing how ideas connect.',
    bullets: [
      'Millions of papers across all disciplines',
      'Interactive concept map for every search',
      'Sorted by citation count — most impactful first',
      'Free, no sign-up, no API key required',
    ],
    href: null,
    cta: null,
    ctaCls: '',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 01-5.303 0l-.347-.347z" />
      </svg>
    ),
    color: 'bg-violet-50 text-violet-600 border-violet-100',
    badge: 'AI',
    badgeCls: 'bg-violet-100 text-violet-700',
    title: 'AI Scientist Profiles',
    desc: 'Click any scientist in the rankings to generate a detailed plain-English profile. Claude looks up their actual publications on OpenAlex and explains their work, key contributions, and real-world impact — written for a complete beginner.',
    bullets: [
      'Five structured sections: Who, Problems, Most Influential Work, Contributions, Impact',
      'Enriched with real publication data from OpenAlex when available',
      'Clickable paper list with citation counts and DOI links',
      'Language calibrated for non-experts',
    ],
    href: '/rankings/import',
    cta: 'Try it →',
    ctaCls: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
];

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [conceptGraph, setConceptGraph] = useState<ConceptGraph>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [activeQuery, setActiveQuery] = useState('');
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<Set<SourceId>>(
    () => new Set(ALL_SOURCES.map((s) => s.id))
  );

  const search = useCallback(async (q: string, pageNum = 1, sources?: Set<SourceId>) => {
    const activeSources = sources ?? selectedSources;
    const isNewSearch = pageNum === 1;
    if (isNewSearch) {
      setLoading(true);
      setPapers([]);
      setConceptGraph({ nodes: [], links: [] });
      setError(null);
      setPage(1);
    } else {
      setLoadingMore(true);
    }
    try {
      const cid = isNewSearch ? '' : (conceptId ? `&conceptId=${encodeURIComponent(conceptId)}` : '');
      const srcParam = `&sources=${[...activeSources].join(',')}`;
      const res = await fetch(`/api/search?query=${encodeURIComponent(q)}&page=${pageNum}${cid}${srcParam}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setPapers((prev) => (isNewSearch ? data.papers : [...prev, ...data.papers]));
      setTotalCount(data.totalCount);
      if (isNewSearch) { setConceptGraph(data.conceptGraph); setConceptId(data.conceptId ?? null); }
      setPage(pageNum);
      setActiveQuery(q);
      setHasSearched(true);
    } catch {
      setError('Failed to fetch results. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conceptId, selectedSources]);

  function handleSearch(q: string) { setQuery(q); search(q, 1); }
  function handleLoadMore() { search(activeQuery, page + 1); }

  function toggleSource(id: SourceId) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  }
  const hasMore = papers.length < totalCount && totalCount > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-lg hidden sm:block">Research Explorer</span>
          </div>
          <nav className="hidden sm:flex items-center gap-1 flex-shrink-0">
            <Link href="/rankings/import" className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
              Rankings
            </Link>
          </nav>
          {hasSearched && (
            <div className="flex-1">
              <SearchBar onSearch={handleSearch} loading={loading} initialQuery={activeQuery} />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4">

        {/* ── Hero ── */}
        {!hasSearched && (
          <section className="pt-12 pb-8 text-center max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2 leading-tight">
              Search across <span className="text-blue-600">7 academic databases</span>
            </h1>
            <p className="text-slate-500 text-sm mb-6">
              Semantic Scholar · OpenAlex · PubMed · arXiv · Europe PMC · ERIC · Google Scholar
            </p>

            {/* Big search bar */}
            <div className="mb-4">
              <SearchBar onSearch={handleSearch} loading={loading} initialQuery={query} />
            </div>

            {/* Database selector */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-6">
              {ALL_SOURCES.map((src) => {
                const active = selectedSources.has(src.id);
                return (
                  <button
                    key={src.id}
                    onClick={() => toggleSource(src.id)}
                    title={src.needsKey ? `${src.label} — requires API key` : src.label}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${active ? src.activeColor : src.color}`}
                  >
                    {active && <span className="text-[9px]">✓</span>}
                    {src.short}
                  </button>
                );
              })}
            </div>

            {/* Example topics */}
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleSearch(t)}
                  className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Features section ── */}
        {!hasSearched && (
          <section className="pb-16">
            <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">What you can do</h2>
            <p className="text-slate-500 text-sm text-center mb-10">Two tools, one place — paper search and scientist rankings</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className={`rounded-2xl border p-6 flex flex-col ${f.color} ${f.title === 'Stanford Top 2% Rankings' ? 'lg:col-span-1 ring-2 ring-red-200' : ''}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${f.color}`}>
                      {f.icon}
                    </div>
                    {f.badge && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${f.badgeCls}`}>{f.badge}</span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">{f.desc}</p>
                  <ul className="space-y-1.5 flex-1 mb-5">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="flex-shrink-0 mt-0.5 text-slate-400">✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                  {f.href && f.cta && (
                    <Link
                      href={f.href}
                      className={`mt-auto inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${f.ctaCls}`}
                    >
                      {f.cta}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── How Stanford Rankings works ── */}
        {!hasSearched && (
          <section className="pb-16">
            <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-2xl p-8">
              <h2 className="text-xl font-bold text-slate-900 mb-1">How the Stanford Rankings feature works</h2>
              <p className="text-sm text-slate-500 mb-8">Three steps from spreadsheet to insight</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  {
                    step: '1',
                    title: 'Download the dataset',
                    body: 'Get the official Stanford/Elsevier Top 2% Scientists dataset from Elsevier Digital Commons (free). Available for 2019–2026.',
                    href: 'https://elsevier.digitalcommonsdata.com/datasets/btchxktzyw/8',
                    link: 'Download dataset →',
                  },
                  {
                    step: '2',
                    title: 'Import the Excel file',
                    body: 'Click Browse in the import page, select the .xlsx file. No copy-paste needed — columns are auto-detected across all dataset versions.',
                    href: '/rankings/import',
                    link: 'Open import page →',
                  },
                  {
                    step: '3',
                    title: 'Browse & explore',
                    body: 'Filter by field, subfield, year. Click "Generate detailed profile" on any scientist to get a plain-English explanation of their work and impact.',
                    href: null,
                    link: null,
                  },
                ].map((s) => (
                  <div key={s.step} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-600 text-white text-sm font-bold flex items-center justify-center">
                      {s.step}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-1">{s.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed mb-2">{s.body}</p>
                      {s.href && s.link && (
                        <Link href={s.href} target={s.href.startsWith('http') ? '_blank' : undefined} rel={s.href.startsWith('http') ? 'noopener noreferrer' : undefined} className="text-xs text-red-600 hover:underline font-medium">
                          {s.link}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {/* ── Source selector bar (shown after first search) ── */}
        {hasSearched && (
          <div className="pt-4 pb-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Sources:</span>
            {ALL_SOURCES.map((src) => {
              const active = selectedSources.has(src.id);
              return (
                <button
                  key={src.id}
                  onClick={() => { toggleSource(src.id); }}
                  title={src.needsKey ? `${src.label} — requires PDFVECTOR_API_KEY` : src.label}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold transition-all ${active ? src.activeColor : src.color}`}
                >
                  {active && <span className="text-[9px]">✓</span>}
                  {src.short}
                  {src.needsKey && !active && <span className="text-[9px] opacity-60">🔑</span>}
                </button>
              );
            })}
            {activeQuery && (
              <button
                onClick={() => search(activeQuery, 1)}
                className="ml-1 px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 transition-colors"
              >
                Re-search
              </button>
            )}
          </div>
        )}

        {/* ── Search results ── */}
        {(hasSearched || loading) && (
          <div className="py-6 flex flex-col lg:flex-row gap-6">
            <div className="lg:w-[420px] xl:w-[480px] flex-shrink-0">
              <div className="lg:sticky lg:top-24 space-y-2">
                <h2 className="text-sm font-semibold text-slate-700">
                  Concept Map
                  {conceptGraph.nodes.length > 0 && (
                    <span className="ml-2 text-slate-400 font-normal">{conceptGraph.nodes.length} concepts</span>
                  )}
                </h2>
                {loading ? (
                  <div className="bg-slate-100 rounded-xl animate-pulse" style={{ height: 420 }} />
                ) : (
                  <ConceptMap graph={conceptGraph} height={420} onSearch={handleSearch} />
                )}
                {!loading && conceptGraph.nodes.length > 0 && (() => {
                  const broader  = conceptGraph.nodes.filter((n) => n.id.startsWith('ai-b-'));
                  const related  = conceptGraph.nodes.filter((n) => n.id.startsWith('ai-r-'));
                  const narrower = conceptGraph.nodes.filter((n) => n.id.startsWith('ai-n-'));
                  if (!broader.length && !related.length && !narrower.length) return null;
                  const Section = ({ label, nodes, chipCls }: { label: string; nodes: typeof broader; chipCls: string }) => (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'inherit' }}>{label}</p>
                      <div className="flex flex-wrap gap-1">
                        {nodes.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => handleSearch(n.name)}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-all hover:opacity-80 ${chipCls}`}
                          >
                            {n.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                  return (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                      <p className="text-xs font-semibold text-slate-700">Related concepts — click to search</p>
                      {broader.length  > 0 && <Section label="Broader fields"   nodes={broader}  chipCls="bg-slate-100 text-slate-600 border-slate-200 text-slate-700" />}
                      {related.length  > 0 && <Section label="Related topics"   nodes={related}  chipCls="bg-blue-50 text-blue-700 border-blue-200" />}
                      {narrower.length > 0 && <Section label="Narrower topics"  nodes={narrower} chipCls="bg-violet-50 text-violet-700 border-violet-200" />}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse" style={{ height: 110 }} />
                  ))}
                </div>
              ) : (
                <PaperList
                  papers={papers}
                  totalCount={totalCount}
                  query={activeQuery}
                  onLoadMore={handleLoadMore}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-8 border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-700">Research Explorer</span>
            </div>
            <p className="text-xs text-slate-400 text-center">
              Paper data from{' '}
              <a href="https://www.semanticscholar.org" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">Semantic Scholar</a>
              {' '}&amp;{' '}
              <a href="https://openalex.org" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">OpenAlex</a>
              {' '}· Rankings from{' '}
              <a href="https://elsevier.digitalcommonsdata.com/datasets/btchxktzyw/8" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">Stanford/Elsevier</a>
              {' '}· AI profiles by Claude
            </p>
            <Link href="/rankings/import" className="text-xs text-red-600 hover:underline font-medium">Stanford Rankings →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
