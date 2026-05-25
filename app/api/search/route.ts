import { NextRequest, NextResponse } from 'next/server';
import { searchSemanticScholar } from '@/lib/semanticScholar';
import { searchOpenAlex, findBestConcept, fetchTopicConceptGraph } from '@/lib/openAlex';
import { generateKeywords } from '@/lib/ai';
import { Paper, ConceptGraph, ConceptNode } from '@/types';

function buildAiConceptGraph(query: string, keywords: { broader: string[]; related: string[]; narrower: string[] }): ConceptGraph {
  const nodes: ConceptNode[] = [];
  const mainId = `ai-main`;

  nodes.push({
    id: mainId,
    name: query,
    level: 1,
    score: 1.0,
    worksCount: 0,
    isMain: true,
  });

  for (const name of keywords.broader) {
    nodes.push({ id: `ai-b-${name}`, name, level: 0, score: 0.7, worksCount: 0 });
  }
  for (const name of keywords.related) {
    nodes.push({ id: `ai-r-${name}`, name, level: 1, score: 0.6, worksCount: 0 });
  }
  for (const name of keywords.narrower) {
    nodes.push({ id: `ai-n-${name}`, name, level: 2, score: 0.5, worksCount: 0 });
  }

  return { nodes, links: [] };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const conceptIdParam = searchParams.get('conceptId') ?? undefined;
  let conceptId = conceptIdParam;
  let conceptGraph: ConceptGraph = { nodes: [], links: [] };

  if (page === 1) {
    // Run concept lookup and paper search concurrently
    const conceptPromise = findBestConcept(query).catch(() => null);
    const [s2Raw, oaRaw] = await Promise.allSettled([
      searchSemanticScholar(query, 0, 50),
      searchOpenAlex(query, 1, 100, undefined),
    ]);

    const concept = await conceptPromise;
    conceptId = concept?.id ?? undefined;

    const s2Papers = s2Raw.status === 'fulfilled' ? s2Raw.value.papers : [];
    const oaPapers = oaRaw.status === 'fulfilled' ? oaRaw.value.papers : [];
    const totalCount = Math.max(
      s2Raw.status === 'fulfilled' ? s2Raw.value.total : 0,
      oaRaw.status === 'fulfilled' ? oaRaw.value.total : 0
    );

    // Deduplicate and sort
    const paperMap = new Map<string, Paper>();
    for (const paper of [...oaPapers, ...s2Papers]) {
      const key = paper.doi ? `doi:${paper.doi.toLowerCase()}` : paper.id;
      const existing = paperMap.get(key);
      if (!existing) {
        paperMap.set(key, paper);
      } else if (paper.citationCount > existing.citationCount) {
        paperMap.set(key, { ...paper, abstract: paper.abstract || existing.abstract, source: 'merged' });
      }
    }
    const papers = Array.from(paperMap.values()).sort((a, b) => b.citationCount - a.citationCount);

    // Try AI keywords first (run in parallel with OA concept graph)
    const topTitles = papers.slice(0, 12).map((p) => p.title);
    const [aiKeywords, oaGraph] = await Promise.allSettled([
      generateKeywords(query, topTitles),
      concept ? fetchTopicConceptGraph(query, concept) : Promise.resolve({ nodes: [], links: [] } as ConceptGraph),
    ]);

    if (aiKeywords.status === 'fulfilled' && aiKeywords.value) {
      conceptGraph = buildAiConceptGraph(query, aiKeywords.value);
    } else if (oaGraph.status === 'fulfilled') {
      conceptGraph = oaGraph.value;
    }

    return NextResponse.json({ papers, totalCount, conceptGraph, page, conceptId: conceptId ?? null });
  }

  // Subsequent pages
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

  const paperMap = new Map<string, Paper>();
  for (const paper of [...oaPapers, ...s2Papers]) {
    const key = paper.doi ? `doi:${paper.doi.toLowerCase()}` : paper.id;
    const existing = paperMap.get(key);
    if (!existing) {
      paperMap.set(key, paper);
    } else if (paper.citationCount > existing.citationCount) {
      paperMap.set(key, { ...paper, abstract: paper.abstract || existing.abstract, source: 'merged' });
    }
  }

  const papers = Array.from(paperMap.values()).sort((a, b) => b.citationCount - a.citationCount);

  return NextResponse.json({ papers, totalCount, conceptGraph, page, conceptId: conceptId ?? null });
}
