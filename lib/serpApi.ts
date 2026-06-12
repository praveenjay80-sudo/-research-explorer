import { Paper } from '@/types';

const BASE = 'https://serpapi.com/search.json';

interface SerpResult {
  title?: string;
  link?: string;
  snippet?: string;
  publication_info?: {
    summary?: string;
    authors?: Array<{ name: string }>;
  };
  inline_links?: {
    cited_by?: { total?: number };
  };
  resources?: Array<{ link?: string }>;
}

function extractYear(summary: string | undefined): number | null {
  if (!summary) return null;
  const m = summary.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function extractDoi(link: string | undefined): string | undefined {
  if (!link) return undefined;
  const m = link.match(/10\.\d{4,}\/[^\s&?#]+/);
  return m ? m[0] : undefined;
}

export async function searchGoogleScholar(
  query: string,
  start = 0,
  limit = 20,
): Promise<{ papers: Paper[]; total: number }> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return { papers: [], total: 0 };

  try {
    const params = new URLSearchParams({
      engine: 'google_scholar',
      q: query,
      api_key: apiKey,
      num: String(Math.min(limit, 20)),
      start: String(start),
      hl: 'en',
    });

    const res = await fetch(`${BASE}?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { papers: [], total: 0 };

    const data = await res.json();
    const results: SerpResult[] = data.organic_results ?? [];
    const total: number = data.search_information?.total_results ?? results.length;

    const papers: Paper[] = results
      .filter((r) => r.title)
      .map((r, i) => {
        const doi = extractDoi(r.link) ?? extractDoi(r.resources?.[0]?.link);
        const citationCount = r.inline_links?.cited_by?.total ?? 0;
        const authors = r.publication_info?.authors?.map((a) => a.name) ??
          r.publication_info?.summary?.split(' - ')[0].split(', ').slice(0, 4) ?? [];
        const year = extractYear(r.publication_info?.summary);

        return {
          id: `gs-${start + i}-${doi ?? r.title?.slice(0, 20) ?? i}`,
          title: r.title ?? 'Untitled',
          authors,
          year,
          citationCount,
          abstract: r.snippet,
          url: doi ? `https://doi.org/${doi}` : (r.link ?? undefined),
          source: 'google-scholar' as const,
          doi,
          fieldsOfStudy: [],
          workType: 'article',
        };
      });

    return { papers, total };
  } catch {
    return { papers: [], total: 0 };
  }
}
