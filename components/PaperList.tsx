'use client';

import { useState } from 'react';
import { Paper } from '@/types';
import PaperCard from './PaperCard';

interface PaperListProps {
  papers: Paper[];
  totalCount: number;
  query: string;
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
}

const BOOK_TYPES = new Set(['book', 'book-chapter', 'Book', 'BookChapter']);

function isBook(p: Paper): boolean {
  if (!p.workType) return false;
  return BOOK_TYPES.has(p.workType);
}

export default function PaperList({
  papers,
  totalCount,
  query,
  onLoadMore,
  loadingMore,
  hasMore,
}: PaperListProps) {
  const [tab, setTab] = useState<'papers' | 'books'>('papers');

  const articlePapers = papers.filter((p) => !isBook(p));
  const bookPapers = papers.filter((p) => isBook(p));
  const shown = tab === 'papers' ? articlePapers : bookPapers;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          ~{totalCount.toLocaleString()} results for{' '}
          <span className="text-slate-900">&ldquo;{query}&rdquo;</span>
        </h2>
        <span className="text-xs text-slate-400">Sorted by citations</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setTab('papers')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'papers'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Papers
          <span className="bg-slate-200 text-slate-600 text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[22px] text-center">
            {articlePapers.length}
          </span>
        </button>
        <button
          onClick={() => setTab('books')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'books'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Books
          <span className="bg-slate-200 text-slate-600 text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[22px] text-center">
            {bookPapers.length}
          </span>
        </button>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2.5">
        {shown.map((paper, i) => (
          <PaperCard key={paper.id} paper={paper} rank={i + 1} />
        ))}
      </div>

      {shown.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border border-slate-200">
          No {tab} found for &ldquo;{query}&rdquo;
        </div>
      )}

      {hasMore && tab === 'papers' && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-1 w-full py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {loadingMore ? 'Loading more...' : 'Load more papers'}
        </button>
      )}
    </div>
  );
}
