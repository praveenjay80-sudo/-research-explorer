'use client';

import Link from 'next/link';
import { RankedScientist } from '@/types/rankings';
import { countryFlag, formatCitations } from '@/lib/rankings';

const SOURCE_BADGE = {
  stanford: { label: 'Stanford Official', cls: 'bg-red-100 text-red-700' },
  snapshot: { label: 'OA Snapshot', cls: 'bg-amber-100 text-amber-700' },
  openalex: { label: 'OpenAlex Live', cls: 'bg-green-100 text-green-700' },
};

const RANK_COLORS = [
  'bg-yellow-400 text-yellow-900',
  'bg-slate-300 text-slate-700',
  'bg-amber-600 text-white',
];

interface Props {
  scientist: RankedScientist;
}

export default function ScientistCard({ scientist }: Props) {
  const badge = SOURCE_BADGE[scientist.dataSource];
  const rankCls = scientist.rank <= 3 ? RANK_COLORS[scientist.rank - 1] : 'bg-slate-100 text-slate-500';
  const flag = countryFlag(scientist.country);
  const hasProfile = !!scientist.openAlexId;

  const inner = (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all">
      <div className="flex items-start gap-3">
        {/* Rank */}
        <span className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${rankCls}`}>
          {scientist.rank}
        </span>

        <div className="flex-1 min-w-0">
          {/* Name + badge */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 leading-snug">
              {scientist.name}
            </h3>
            <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {/* Institution */}
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {flag && <span className="mr-1">{flag}</span>}
            {scientist.institution}
          </p>

          {/* Metrics */}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <Metric
              icon="★"
              iconCls="text-yellow-500"
              value={formatCitations(scientist.citedByCount)}
              label="citations"
            />
            <Metric value={`h${scientist.hIndex}`} label="h-index" />
            <Metric value={formatCitations(scientist.worksCount)} label="works" />
            {scientist.cScore !== undefined && (
              <Metric value={scientist.cScore.toFixed(2)} label="c-score" />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!hasProfile) return inner;
  return (
    <Link href={`/rankings/${scientist.openAlexId}`} className="block">
      {inner}
    </Link>
  );
}

function Metric({ icon, iconCls, value, label }: {
  icon?: string; iconCls?: string; value: string; label: string;
}) {
  return (
    <span className="flex items-center gap-0.5 text-xs text-slate-600">
      {icon && <span className={iconCls}>{icon}</span>}
      <span className="font-semibold">{value}</span>
      <span className="text-slate-400">{label}</span>
    </span>
  );
}
