import { Paper } from '@/types';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

function s2Headers(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'ResearchExplorer/1.0' };
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    h['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }
  return h;
}

interface S2Paper {
  paperId: string;
  title: string;
  authors: Array<{ name: string }>;
  year: number;
  citationCount: number;
  abstract?: string;
  externalIds?: { DOI?: string; ArXiv?: string };
  fieldsOfStudy?: string[];
  url?: string;
  publicationTypes?: string[];
}

export async function searchSemanticScholar(
  query: string,
  offset = 0,
  limit = 50
): Promise<{ papers: Paper[]; total: number }> {
  const params = new URLSearchParams({
    query,
    fields: 'title,authors,year,citationCount,abstract,externalIds,fieldsOfStudy,url,publicationTypes',
    limit: String(Math.min(limit, 100)),
    offset: String(offset),
  });

  const res = await fetch(`${BASE_URL}/paper/search?${params}`, {
    headers: s2Headers(),
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limited by Semantic Scholar');
    throw new Error(`Semantic Scholar API error: ${res.status}`);
  }

  const data = await res.json();

  const papers: Paper[] = ((data.data as S2Paper[]) || []).map((p) => ({
    id: `s2-${p.paperId}`,
    title: p.title || 'Untitled',
    authors: (p.authors || []).slice(0, 6).map((a) => a.name),
    year: p.year || null,
    citationCount: p.citationCount || 0,
    abstract: p.abstract,
    url: p.externalIds?.DOI
      ? `https://doi.org/${p.externalIds.DOI}`
      : p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
    source: 'semantic-scholar',
    fieldsOfStudy: p.fieldsOfStudy || [],
    doi: p.externalIds?.DOI,
    workType: p.publicationTypes?.includes('Book') ? 'book' : 'article',
  }));

  return { papers, total: data.total || 0 };
}

export interface Reference {
  paperId?: string;
  title: string;
  authors: string[];
  year?: number;
  citationCount: number;
  doi?: string;
  url: string;
}

export async function fetchReferences(lookupId: string): Promise<Reference[]> {
  const fields = 'title,authors,year,citationCount,externalIds';
  const res = await fetch(
    `${BASE_URL}/paper/${encodeURIComponent(lookupId)}/references?fields=${fields}&limit=100`,
    { headers: s2Headers() }
  );
  if (!res.ok) return [];
  const data = await res.json();

  return ((data.data as Array<{ citedPaper: S2Paper & { paperId: string } }>) || [])
    .map((item) => {
      const p = item.citedPaper;
      if (!p?.title) return null;
      return {
        paperId: p.paperId,
        title: p.title,
        authors: (p.authors || []).slice(0, 3).map((a) => a.name),
        year: p.year || undefined,
        citationCount: p.citationCount || 0,
        doi: p.externalIds?.DOI,
        url: p.externalIds?.DOI
          ? `https://doi.org/${p.externalIds.DOI}`
          : `https://www.semanticscholar.org/paper/${p.paperId}`,
      };
    })
    .filter(Boolean) as Reference[];
}
