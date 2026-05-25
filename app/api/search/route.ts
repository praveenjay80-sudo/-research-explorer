import { NextRequest, NextResponse } from 'next/server';
import { searchSemanticScholar } from '@/lib/semanticScholar';
import { searchOpenAlex, findBestConcept, fetchTopicConceptGraph } from '@/lib/openAlex';
import { Paper, ConceptGraph } from '@/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  // On page 1: look up concept first (used for both concept map + precise search)
  // On subsequent pages: concept ID passed in query param
  const conceptIdParam = searchParams.get('conceptId') ?? undefined;

  let conceptId = conceptIdParam;
  let conceptGraph: ConceptGraph = { nodes: [], links: [] };

  if (page === 1) {
    const concept = await findBestConcept(query).catch(() => null);
    conceptId = concept?.id ?? undefined;
    if (concept) {
      conceptGraph = await fetchTopicConceptGraph(query, concept).catch(() => ({ nodes: [], links: [] }));
    }
  }

  // Fetch papers from both sources concurrently
  const [s2Result, oaResult] = await Promise.allSettled([
    searchSemanticScholar(query, (page - 1) * 50, 50),
    searchOpenAlex(query, page, 100, conceptId),
  ]);

  const s2Papers = s2Result.status === 'fulfilled' ? s2Result.value.papers : [];
  const oaPapers = oaResult.status === 'fulfilled' ? oaResult.value.papers : [];
  const totalCount = Math.max(
    s2Result.status === 'fulfilled' ? s2Result.value.total : 0,
    oaResult.status === 'fulfilled' ? oaResult.value.total : 0
  );

  // Deduplicate by DOI, keep highest citation count
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

  return NextResponse.json({ papers, totalCount, conceptGraph, page, conceptId: conceptId ?? null });
}
