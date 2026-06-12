'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ScientistProfile, ScientistWork } from '@/types/rankings';
import { countryFlag, formatCitations } from '@/lib/rankings';

export default function ScientistPage() {
  const { authorId } = useParams<{ authorId: string }>();

  const [profile, setProfile] = useState<ScientistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioError, setBioError] = useState(false);

  useEffect(() => {
    if (!authorId) return;
    fetch(`/api/rankings/${authorId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((d: ScientistProfile) => setProfile(d))
      .catch(() => setError('Could not load scientist profile.'))
      .finally(() => setLoading(false));
  }, [authorId]);

  async function generateBio() {
    if (!profile) return;
    setBioLoading(true);
    setBioError(false);
    try {
      const res = await fetch('/api/rankings/bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          institution: profile.institution,
          country: profile.country,
          field: profile.field,
          subfield: profile.subfield,
          citedByCount: profile.citedByCount,
          hIndex: profile.hIndex,
          worksCount: profile.worksCount,
          firstYear: profile.firstYear,
          lastYear: profile.lastYear,
          topics: profile.topics,
          topWorks: profile.topWorks.slice(0, 5),
        }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setBio(d.bio ?? '');
    } catch {
      setBioError(true);
    } finally {
      setBioLoading(false);
    }
  }

  if (loading) return <PageShell><LoadingSkeleton /></PageShell>;
  if (error || !profile) return <PageShell><ErrorState message={error ?? 'Profile not found.'} /></PageShell>;

  const flag = countryFlag(profile.country);
  const careerSpan = profile.firstYear && profile.lastYear
    ? `${profile.firstYear} – ${profile.lastYear}`
    : profile.lastYear ? `until ${profile.lastYear}` : '';

  const maxCitations = Math.max(...profile.citationsByYear.map((c) => c.cited_by_count), 1);

  return (
    <PageShell>
      {/* Back */}
      <div className="mb-6">
        <Link href="/rankings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Rankings
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Hero card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{profile.name}</h1>
                <p className="text-slate-500 mt-0.5 flex items-center gap-1.5">
                  {flag && <span>{flag}</span>}
                  <span>{profile.institution}</span>
                  {profile.country && <span className="text-slate-300">·</span>}
                  {profile.country && <span className="text-slate-400">{profile.country}</span>}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                {profile.field && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                    {profile.field}
                  </span>
                )}
                {profile.subfield && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                    {profile.subfield}
                  </span>
                )}
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricBox label="Citations" value={formatCitations(profile.citedByCount)} highlight />
              <MetricBox label="H-Index" value={`h${profile.hIndex}`} />
              <MetricBox label="Works" value={formatCitations(profile.worksCount)} />
              <MetricBox label="Active" value={careerSpan || '—'} small />
            </div>

            {/* External links */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <a
                href={`https://openalex.org/authors/${authorId}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
              >
                OpenAlex profile ↗
              </a>
              {profile.orcid && (
                <a
                  href={`https://orcid.org/${profile.orcid}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-lime-100 text-lime-700 hover:bg-lime-200 transition-colors"
                >
                  ORCID ↗
                </a>
              )}
              {profile.scopusId && (
                <a
                  href={`https://www.scopus.com/authid/detail.uri?authorId=${profile.scopusId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                >
                  Scopus ↗
                </a>
              )}
            </div>
          </div>

          {/* Scientific Biography */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Scientific Biography</h2>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                AI Generated
              </span>
            </div>
            {bio ? (
              <p className="text-sm text-slate-700 leading-relaxed">{bio}</p>
            ) : bioLoading ? (
              <div className="space-y-2">
                <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-4/5" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" />
              </div>
            ) : bioError ? (
              <div className="text-sm text-red-600">
                Failed to generate biography.{' '}
                <button onClick={generateBio} className="underline hover:no-underline">Retry</button>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-slate-400 mb-3">
                  Uses Claude AI to write a biography from citation data and top papers.
                </p>
                <button
                  onClick={generateBio}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Generate Biography
                </button>
              </div>
            )}
          </section>

          {/* Most Influential Works */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Most Influential Works</h2>
            {profile.topWorks.length === 0 ? (
              <p className="text-sm text-slate-400">No works found.</p>
            ) : (
              <ol className="space-y-3">
                {profile.topWorks.map((w, i) => (
                  <WorkItem key={w.id} work={w} rank={i + 1} />
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Citation history chart */}
          {profile.citationsByYear.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Citation History</h2>
              <div className="flex items-end gap-1 h-28">
                {profile.citationsByYear.map((c) => {
                  const pct = Math.max(4, (c.cited_by_count / maxCitations) * 100);
                  return (
                    <div key={c.year} className="flex-1 flex flex-col items-center gap-1" title={`${c.year}: ${c.cited_by_count.toLocaleString()} citations`}>
                      <div
                        className="w-full bg-blue-400 rounded-t-sm hover:bg-blue-500 transition-colors cursor-default"
                        style={{ height: `${pct}%` }}
                      />
                      <span className="text-[8px] text-slate-400 leading-none">
                        {String(c.year).slice(-2)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-2 text-center">
                Citations received per year (last {profile.citationsByYear.length} years)
              </p>
            </section>
          )}

          {/* Research topics */}
          {profile.topics.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Research Topics</h2>
              <div className="flex flex-wrap gap-1.5">
                {profile.topics.map((t) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Additional metrics */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Metrics Detail</h2>
            <dl className="space-y-2.5 text-sm">
              <MetricRow label="Total citations" value={profile.citedByCount.toLocaleString()} />
              <MetricRow label="H-index" value={String(profile.hIndex)} />
              <MetricRow label="i10-index" value={String(profile.i10Index)} />
              <MetricRow label="2yr mean citedness" value={profile.twoYrMeanCitedness.toFixed(1)} />
              <MetricRow label="Total works" value={profile.worksCount.toLocaleString()} />
              {careerSpan && <MetricRow label="Career span" value={careerSpan} />}
            </dl>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
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
            <Link href="/rankings" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50">Rankings</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}

function MetricBox({ label, value, highlight, small }: {
  label: string; value: string; highlight?: boolean; small?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 border border-slate-200'}`}>
      <div className={`font-bold ${small ? 'text-sm' : 'text-lg'} ${highlight ? 'text-blue-700' : 'text-slate-800'}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function WorkItem({ work, rank }: { work: ScientistWork; rank: number }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center mt-0.5">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <a
          href={work.url}
          target="_blank" rel="noopener noreferrer"
          className="text-sm font-medium text-slate-900 hover:text-blue-600 leading-snug line-clamp-2"
        >
          {work.title}
        </a>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 flex-wrap">
          {work.year && <span>{work.year}</span>}
          {work.journal && <><span>·</span><span className="truncate max-w-[160px]">{work.journal}</span></>}
          <span className="text-yellow-600 font-semibold">★ {formatCitations(work.citationCount)}</span>
        </div>
      </div>
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
      <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse h-56" />
      <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse h-40" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-slate-500 mb-4">{message}</p>
      <Link href="/rankings" className="text-blue-600 hover:underline text-sm">← Back to Rankings</Link>
    </div>
  );
}
