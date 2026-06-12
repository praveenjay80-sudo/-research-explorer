import { NextRequest, NextResponse } from 'next/server';
import { searchSemanticScholar } from '@/lib/semanticScholar';
import { searchOpenAlex, findBestConcept, fetchTopicConceptGraph } from '@/lib/openAlex';
import { searchPdfVector, PV_PROVIDERS } from '@/lib/pdfVector';
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

  // Parse selected sources (comma-separated). Default: all sources.
  const sourcesParam = searchParams.get('sources');
  const selectedSources = sourcesParam ? new Set(sourcesParam.split(',')) : null;
  const useS2 = !selectedSources || selectedSources.has('semantic-scholar');
  const useOA = !selectedSources || selectedSources.has('openalex');
  const pvProviders = PV_PROVIDERS.filter((p) => !selectedSources || selectedSources.has(p));

  const conceptIdParam = searchParams.get('conceptId') ?? undefined;
  let conceptId = conceptIdParam;
  let conceptGraph: ConceptGraph = { nodes: [], links: [] };

  if (page === 1) {
    // Run concept lookup and all paper searches concurrently
    const conceptPromise = useOA ? findBestConcept(query).catch(() => null) : Promise.resolve(null);
    const [s2Raw, oaRaw, pvRaw] = await Promise.allSettled([
      useS2 ? searchSemanticScholar(query, 0, 50) : Promise.resolve({ papers: [], total: 0 }),
      useOA ? searchOpenAlex(query, 1, 100, undefined) : Promise.resolve({ papers: [], total: 0 }),
      pvProviders.length > 0 ? searchPdfVector(query, 0, 25, pvProviders) : Promise.resolve({ papers: [], total: 0 }),
    ]);

    const concept = await conceptPromise;
    conceptId = concept?.id ?? undefined;

    const s2Papers = s2Raw.status === 'fulfilled' ? s2Raw.value.papers : [];
    const oaPapers = oaRaw.status === 'fulfilled' ? oaRaw.value.papers : [];
    const pvPapers = pvRaw.status === 'fulfilled' ? pvRaw.value.papers : [];
    const totalCount = Math.max(
      s2Raw.status === 'fulfilled' ? s2Raw.value.total : 0,
      oaRaw.status === 'fulfilled' ? oaRaw.value.total : 0,
      pvRaw.status === 'fulfilled' ? pvRaw.value.total : 0,
    );

    // Deduplicate and sort (OA first — best metadata, then S2, then PV for new sources)
    const paperMap = new Map<string, Paper>();
    for (const paper of [...oaPapers, ...s2Papers, ...pvPapers]) {
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
  const pvOffset = (page - 1) * 25;
  const [s2Result, oaResult, pvResult] = await Promise.allSettled([
    useS2 ? searchSemanticScholar(query, (page - 1) * 50, 50) : Promise.resolve({ papers: [], total: 0 }),
    useOA ? searchOpenAlex(query, page, 100, conceptId) : Promise.resolve({ papers: [], total: 0 }),
    pvProviders.length > 0 ? searchPdfVector(query, pvOffset, 25, pvProviders) : Promise.resolve({ papers: [], total: 0 }),
  ]);

  const s2Papers = s2Result.status === 'fulfilled' ? s2Result.value.papers : [];
  const oaPapers = oaResult.status === 'fulfilled' ? oaResult.value.papers : [];
  const pvPapers = pvResult.status === 'fulfilled' ? pvResult.value.papers : [];
  const totalCount = Math.max(
    s2Result.status === 'fulfilled' ? s2Result.value.total : 0,
    oaResult.status === 'fulfilled' ? oaResult.value.total : 0,
    pvResult.status === 'fulfilled' ? pvResult.value.total : 0,
  );

  const paperMap = new Map<string, Paper>();
  for (const paper of [...oaPapers, ...s2Papers, ...pvPapers]) {
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
