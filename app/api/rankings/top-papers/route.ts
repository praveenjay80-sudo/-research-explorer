import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://api.openalex.org';
const MAILTO = 'praveen.jay80@gmail.com';

interface OARawWork {
  id: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  primary_location?: {
    source?: { display_name?: string; is_oa?: boolean };
    landing_page_url?: string;
  };
  open_access?: { oa_url?: string; is_oa?: boolean };
  authorships?: Array<{ author?: { display_name?: string } }>;
  abstract_inverted_index?: Record<string, number[]>;
  referenced_works_count?: number;
  counts_by_year?: Array<{ year: number; cited_by_count: number }>;
  type?: string;
}

function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return '';
  const pairs: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) pairs.push([pos, word]);
  }
  return pairs.sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(' ').slice(0, 600);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const field = searchParams.get('field') ?? '';
  const subfield = searchParams.get('subfield') ?? '';
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);

  const searchTerm = subfield || field;
  if (!searchTerm) return NextResponse.json({ papers: [], total: 0 });

  let filter = '';

  // Try topic search first (most specific)
  try {
    const topicParams = new URLSearchParams({ search: searchTerm, 'per-page': '5', mailto: MAILTO });
    const topicRes = await fetch(`${BASE}/topics?${topicParams}`, { next: { revalidate: 86400 } });
    if (topicRes.ok) {
      const topics = ((await topicRes.json()).results ?? []) as Array<{ id: string; display_name: string }>;
      if (topics.length > 0) {
        const topicId = topics[0].id.replace('https://openalex.org/', '');
        filter = `topics.id:${topicId}`;
      }
    }
  } catch { /* fall through */ }

  // Fallback: concept search
  if (!filter) {
    try {
      const conceptParams = new URLSearchParams({
        search: searchTerm, filter: 'level:1', 'per-page': '3', mailto: MAILTO,
      });
      const conceptRes = await fetch(`${BASE}/concepts?${conceptParams}`, { next: { revalidate: 86400 } });
      if (conceptRes.ok) {
        const concepts = ((await conceptRes.json()).results ?? []) as Array<{ id: string }>;
        if (concepts.length > 0) {
          const conceptId = concepts[0].id.replace('https://openalex.org/', '');
          filter = `concepts.id:${conceptId}`;
        }
      }
    } catch { /* give up */ }
  }

  if (!filter) return NextResponse.json({ papers: [], total: 0 });

  const worksParams = new URLSearchParams({
    sort: 'cited_by_count:desc',
    'per-page': String(limit),
    select: 'id,title,publication_year,cited_by_count,doi,primary_location,open_access,authorships,abstract_inverted_index,referenced_works_count,counts_by_year,type',
    mailto: MAILTO,
  });

  const res = await fetch(`${BASE}/works?filter=${filter}&${worksParams}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return NextResponse.json({ papers: [], total: 0 });

  const data = await res.json();
  const works = (data.results ?? []) as OARawWork[];
  const currentYear = new Date().getFullYear();

  const papers = works.map((w) => {
    const recentCitations = (w.counts_by_year ?? [])
      .filter((c) => c.year >= currentYear - 5)
      .reduce((sum, c) => sum + c.cited_by_count, 0);

    return {
      id: w.id,
      title: w.title ?? 'Untitled',
      authors: (w.authorships ?? []).slice(0, 4).map((a) => a.author?.display_name).filter(Boolean),
      year: w.publication_year ?? null,
      journal: w.primary_location?.source?.display_name,
      citationCount: w.cited_by_count ?? 0,
      recentCitations,
      isOA: !!(w.open_access?.is_oa || w.primary_location?.source?.is_oa),
      doi: w.doi,
      url: w.doi
        ? `https://doi.org/${w.doi}`
        : w.open_access?.oa_url
          || w.primary_location?.landing_page_url
          || `https://openalex.org/${w.id}`,
      openAccessUrl: w.open_access?.oa_url,
      abstract: reconstructAbstract(w.abstract_inverted_index),
      referencedWorksCount: w.referenced_works_count ?? 0,
      type: w.type ?? '',
    };
  });

  return NextResponse.json({ papers, total: data.meta?.count ?? works.length });
}
