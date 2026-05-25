'use client';

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

export default function PaperList({
  papers,
  totalCount,
  query,
  onLoadMore,
  loadingMore,
  hasMore,
}: PaperListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Papers & Books
          <span className="ml-2 text-slate-400 font-normal">
            ~{totalCount.toLocaleString()} results for &ldquo;{query}&rdquo;
          </span>
        </h2>
        <span className="text-xs text-slate-400">Sorted by citations</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {papers.map((paper, i) => (
          <PaperCard key={paper.id} paper={paper} rank={i + 1} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-2 w-full py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {loadingMore ? 'Loading...' : 'Load more papers'}
        </button>
      )}

      {papers.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
