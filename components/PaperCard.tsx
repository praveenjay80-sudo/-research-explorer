'use client';

import { useState } from 'react';
import { Paper } from '@/types';

interface PaperCardProps {
  paper: Paper;
  rank: number;
}

const SOURCE_LABELS = {
  'semantic-scholar': { label: 'S2', color: 'bg-orange-100 text-orange-700' },
  openalex: { label: 'OA', color: 'bg-green-100 text-green-700' },
  merged: { label: 'Both', color: 'bg-blue-100 text-blue-700' },
};

function formatCitations(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function PaperCard({ paper, rank }: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);
  const src = SOURCE_LABELS[paper.source] || SOURCE_LABELS.merged;
  const hasAbstract = !!paper.abstract?.trim();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">
          {rank}
        </span>
        <div className="flex-1 min-w-0">
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

          {paper.authors.length > 0 && (
            <p className="text-xs text-slate-500 mb-1.5 truncate">
              {paper.authors.join(', ')}
              {paper.year ? ` · ${paper.year}` : ''}
            </p>
          )}

          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-700">
              <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {formatCitations(paper.citationCount)} citations
            </span>

            {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
              <span className="text-xs text-slate-400 truncate">
                {paper.fieldsOfStudy.slice(0, 2).join(' · ')}
              </span>
            )}
          </div>

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
        </div>
      </div>
    </div>
  );
}
