import { Paper } from '@/types';

const FIELDS = ['title', 'authors', 'year', 'doi', 'totalCitations', 'abstract', 'url', 'source'];

// All providers PDF Vector supports that are NOT already covered by direct S2/OA calls
export const PV_PROVIDERS = ['pubmed', 'arxiv', 'europe-pmc', 'eric', 'google-scholar'] as const;
export type PVProvider = typeof PV_PROVIDERS[number];

interface PVPaper {
  title?: string;
  authors?: string[] | Array<{ name?: string; display_name?: string }>;
  year?: number | string;
  doi?: string;
  totalCitations?: number;
  abstract?: string;
  url?: string;
  source?: string;
}

interface PVResult {
  estimatedTotalResults?: number;
  results?: PVPaper[];
}

function normaliseAuthors(raw: PVPaper['authors']): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((a) => (typeof a === 'string' ? a : a.name ?? a.display_name ?? ''))
    .filter(Boolean)
    .slice(0, 6);
}

export async function searchPdfVector(
  query: string,
  offset = 0,
  limit = 25,
  providers: string[] = [...PV_PROVIDERS],
): Promise<{ papers: Paper[]; total: number }> {
  const apiKey = process.env.PDFVECTOR_API_KEY;
  if (!apiKey || providers.length === 0) return { papers: [], total: 0 };

  try {
    const { createClient } = await import('@pdfvector/client');
    const client = createClient({ apiKey });

    const result = (await (client.academic as unknown as {
      search: (params: Record<string, unknown>) => Promise<PVResult>;
    }).search({
      query,
      providers,
      limit,
      offset,
      fields: FIELDS,
    })) as PVResult;

    const papers: Paper[] = ((result.results ?? []) as PVPaper[]).map((p, i) => {
      const doi = p.doi?.replace(/^https?:\/\/doi\.org\//i, '') || undefined;
      return {
        id: `pv-${offset + i}-${doi ?? p.title?.slice(0, 20) ?? i}`,
        title: p.title ?? 'Untitled',
        authors: normaliseAuthors(p.authors),
        year: p.year ? Number(p.year) : null,
        citationCount: p.totalCitations ?? 0,
        abstract: p.abstract,
        url: doi
          ? `https://doi.org/${doi}`
          : p.url ?? undefined,
        source: 'pdfvector',
        doi,
        fieldsOfStudy: [],
        workType: 'article',
      };
    });

    return { papers, total: result.estimatedTotalResults ?? papers.length };
  } catch {
    return { papers: [], total: 0 };
  }
}
