'use client';

import { useState, useCallback } from 'react';
import SearchBar from '@/components/SearchBar';
import PaperList from '@/components/PaperList';
import ConceptMap from '@/components/ConceptMap';
import { Paper, ConceptGraph } from '@/types';

const EXAMPLE_TOPICS = [
  'transformer neural networks',
  'CRISPR gene editing',
  'large language models',
  'quantum computing',
  'climate change mitigation',
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

  const search = useCallback(async (q: string, pageNum = 1) => {
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
      const res = await fetch(
        `/api/search?query=${encodeURIComponent(q)}&page=${pageNum}${cid}`
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      setPapers((prev) => (isNewSearch ? data.papers : [...prev, ...data.papers]));
      setTotalCount(data.totalCount);
      if (isNewSearch) {
        setConceptGraph(data.conceptGraph);
        setConceptId(data.conceptId ?? null);
      }
      setPage(pageNum);
      setActiveQuery(q);
      setHasSearched(true);
    } catch {
      setError('Failed to fetch results. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  function handleSearch(q: string) {
    setQuery(q);
    search(q, 1);
  }

  function handleLoadMore() {
    search(activeQuery, page + 1);
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
          <div className="flex-1">
            <SearchBar onSearch={handleSearch} loading={loading} initialQuery={query} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Landing state */}
        {!hasSearched && (
          <div className="text-center py-16">
            <h1 className="text-4xl font-bold text-slate-900 mb-3">
              Explore Academic Research
            </h1>
            <p className="text-lg text-slate-500 mb-8 max-w-xl mx-auto">
              Search papers and books on any topic — sorted by citation count with an interactive concept map.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleSearch(t)}
                  className="px-4 py-2 rounded-full border border-slate-200 bg-white text-sm text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors shadow-sm"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {(hasSearched || loading) && (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Concept Map */}
            <div className="lg:w-[420px] xl:w-[480px] flex-shrink-0">
              <div className="lg:sticky lg:top-24 space-y-2">
                <h2 className="text-sm font-semibold text-slate-700">
                  Concept Map
                  {conceptGraph.nodes.length > 0 && (
                    <span className="ml-2 text-slate-400 font-normal">
                      {conceptGraph.nodes.length} concepts
                    </span>
                  )}
                </h2>
                {loading ? (
                  <div className="bg-slate-100 rounded-xl animate-pulse" style={{ height: 420 }} />
                ) : (
                  <ConceptMap graph={conceptGraph} height={420} />
                )}

                {/* Level legend detail */}
                {!loading && conceptGraph.nodes.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-3 text-xs text-slate-500 space-y-1">
                    <p className="font-semibold text-slate-700 mb-1.5">How to read</p>
                    <p>Nodes higher up = broader fields · Nodes lower = narrow topics</p>
                    <p>Arrow direction shows broader → narrower relationships</p>
                    <p>Node size reflects how widely studied the concept is</p>
                  </div>
                )}
              </div>
            </div>

            {/* Papers List */}
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"
                      style={{ height: 110 }}
                    />
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

      <footer className="mt-16 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Data from{' '}
        <a href="https://www.semanticscholar.org" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">
          Semantic Scholar
        </a>{' '}
        &amp;{' '}
        <a href="https://openalex.org" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline">
          OpenAlex
        </a>
        . Free &amp; open APIs — no API key required.
      </footer>
    </div>
  );
}
