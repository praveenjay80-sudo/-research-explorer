import { NextRequest, NextResponse } from 'next/server';
import { searchSemanticScholar } from '@/lib/semanticScholar';
import { searchOpenAlex, fetchTopicConceptGraph } from '@/lib/openAlex';
import { Paper, ConceptGraph } from '@/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const [s2Result, oaResult, conceptResult] = await Promise.allSettled([
    searchSemanticScholar(query, (page - 1) * 50, 50),
    searchOpenAlex(query, page, 50),
    page === 1 ? fetchTopicConceptGraph(query) : Promise.resolve(null),
  ]);

  const s2Papers = s2Result.status === 'fulfilled' ? s2Result.value.papers : [];
  const oaPapers = oaResult.status === 'fulfilled' ? oaResult.value.papers : [];
  const totalCount = Math.max(
    s2Result.status === 'fulfilled' ? s2Result.value.total : 0,
    oaResult.status === 'fulfilled' ? oaResult.value.total : 0
  );

  // Merge and deduplicate by DOI, keeping highest citation count
  const paperMap = new Map<string, Paper>();
  for (const paper of [...oaPapers, ...s2Papers]) {
    const key = paper.doi ? `doi:${paper.doi.toLowerCase()}` : paper.id;
    const existing = paperMap.get(key);
    if (!existing) {
      paperMap.set(key, paper);
    } else if (paper.citationCount > existing.citationCount) {
      paperMap.set(key, {
        ...paper,
        abstract: paper.abstract || existing.abstract,
        source: 'merged',
      });
    }
  }

  const papers = Array.from(paperMap.values()).sort(
    (a, b) => b.citationCount - a.citationCount
  );

  const conceptGraph: ConceptGraph =
    conceptResult.status === 'fulfilled' && conceptResult.value
      ? conceptResult.value
      : { nodes: [], links: [] };

  return NextResponse.json({ papers, totalCount, conceptGraph, page });
}
