'use client';

import { useState } from 'react';
import { Paper } from '@/types';
import type { CuratedReference } from '@/lib/ai';

interface PaperCardProps {
  paper: Paper;
  rank: number;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  'semantic-scholar': { label: 'S2', color: 'bg-orange-100 text-orange-700' },
  openalex:           { label: 'OA', color: 'bg-green-100 text-green-700' },
  merged:             { label: 'Multi', color: 'bg-blue-100 text-blue-700' },
  pdfvector:          { label: 'PV',      color: 'bg-purple-100 text-purple-700' },
  'google-scholar':   { label: 'Scholar', color: 'bg-sky-100 text-sky-700' },
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getLookupId(paper: Paper): string | null {
  if (paper.source === 'semantic-scholar' && paper.id.startsWith('s2-')) {
    return paper.id.slice(3);
  }
  if (paper.doi) return `DOI:${paper.doi}`;
  return null;
}

function ReferencesPanel({ lookupId, paperTitle }: { lookupId: string; paperTitle: string }) {
  const [refs, setRefs] = useState<CuratedReference[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [opened, setOpened] = useState(false);
  const [aiCurated, setAiCurated] = useState(false);

  async function load() {
    if (opened) { setOpened(false); return; }
    setOpened(true);
    if (refs !== null) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/bibliography?paperId=${encodeURIComponent(lookupId)}&title=${encodeURIComponent(paperTitle)}`
      );
      const data = await res.json();
      setRefs(data.references ?? []);
      setAiCurated(data.aiCurated ?? false);
    } catch {
      setError(true);
      setRefs([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        onClick={load}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 font-medium transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        {opened ? 'Hide bibliography' : 'Show bibliography'}
        {loading && <span className="ml-1 opacity-60">loading…</span>}
      </button>

      {opened && !loading && (
        <div className="mt-2">
          {error || (refs && refs.length === 0) ? (
            <p className="text-xs text-slate-400 italic">
              {error ? 'Could not load references.' : 'No references found for this paper.'}
            </p>
          ) : (
            <>
              {aiCurated && (
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                    AI Curated
                  </span>
                  <span className="text-[10px] text-slate-400">Key references selected by Claude</span>
                </div>
              )}
              <ol className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {(refs ?? []).map((ref, i) => (
                  <li key={ref.paperId ?? i} className="flex gap-2 text-xs text-slate-600">
                    <span className="flex-shrink-0 w-5 text-slate-300 text-right font-medium">{i + 1}.</span>
                    <div className="min-w-0">
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-slate-800 hover:text-blue-600 leading-snug line-clamp-2"
                      >
                        {ref.title}
                      </a>
                      <div className="text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        {ref.authors.length > 0 && (
                          <span>
                            {ref.authors.join(', ')}
                            {ref.year ? ` (${ref.year})` : ''}
                          </span>
                        )}
                        {ref.citationCount > 0 && (
                          <span className="flex items-center gap-0.5 text-yellow-600 font-medium">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {formatNum(ref.citationCount)}
                          </span>
                        )}
                      </div>
                      {ref.importance && (
                        <p className="mt-1 text-[11px] text-slate-500 leading-snug italic border-l-2 border-purple-200 pl-2">
                          {ref.importance}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PaperCard({ paper, rank }: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);
  const src = SOURCE_LABELS[paper.source] || SOURCE_LABELS.merged;
  const hasAbstract = !!paper.abstract?.trim();
  const lookupId = getLookupId(paper);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          {/* Title + badges */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-slate-900 hover:text-blue-600 leading-snug line-clamp-2"
            >
              {paper.title}
            </a>
            <div className="flex-shrink-0 flex items-center gap-1.5">
              {paper.workType === 'book' && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                  Book
                </span>
              )}
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${src.color}`}>
                {src.label}
              </span>
            </div>
          </div>

          {/* Authors + year */}
          {paper.authors.length > 0 && (
            <p className="text-xs text-slate-500 mb-1.5 truncate">
              {paper.authors.join(', ')}
              {paper.year ? ` · ${paper.year}` : ''}
            </p>
          )}

          {/* Citations + fields */}
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-700">
              <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {formatNum(paper.citationCount)} citations
            </span>
            {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
              <span className="text-xs text-slate-400 truncate">
                {paper.fieldsOfStudy.slice(0, 2).join(' · ')}
              </span>
            )}
          </div>

          {/* Abstract */}
          {hasAbstract && (
            <>
              <p className={`text-xs text-slate-600 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                {paper.abstract}
              </p>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-blue-500 hover:text-blue-700 mt-1 font-medium"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            </>
          )}

          {/* Bibliography */}
          {lookupId && <ReferencesPanel lookupId={lookupId} paperTitle={paper.title} />}
        </div>
      </div>
    </div>
  );
}
