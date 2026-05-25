import { Paper, ConceptNode, ConceptLink, ConceptGraph } from '@/types';

const BASE_URL = 'https://api.openalex.org';
const MAILTO = 'praveen.jay80@gmail.com';

interface OAWork {
  id: string;
  title: string;
  type?: string;
  authorships: Array<{ author: { display_name: string } }>;
  publication_year: number;
  cited_by_count: number;
  concepts: Array<{ id: string; display_name: string; level: number; score: number }>;
  abstract_inverted_index?: Record<string, number[]>;
  doi?: string;
  open_access?: { oa_url?: string };
  primary_location?: { landing_page_url?: string };
}

interface OAConcept {
  id: string;
  display_name: string;
  level: number;
  ancestors: Array<{ id: string; display_name: string; level: number }>;
  related_concepts?: Array<{ id: string; display_name: string; level: number; score: number }>;
  description?: string;
  works_count: number;
}

function reconstructAbstract(inv: Record<string, number[]> | undefined): string {
  if (!inv) return '';
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) words.push([word, pos]);
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map(([w]) => w).join(' ');
}

export async function searchOpenAlex(
  query: string,
  page = 1,
  perPage = 50
): Promise<{ papers: Paper[]; total: number }> {
  const params = new URLSearchParams({
    search: query,
    sort: 'cited_by_count:desc',
    'per-page': String(perPage),
    page: String(page),
    select: 'id,title,type,authorships,publication_year,cited_by_count,abstract_inverted_index,doi,open_access,primary_location',
    mailto: MAILTO,
  });

  const res = await fetch(`${BASE_URL}/works?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`OpenAlex API error: ${res.status}`);
  const data = await res.json();

  const papers: Paper[] = ((data.results as OAWork[]) || []).map((work) => {
    const url =
      work.doi
        ? `https://doi.org/${work.doi}`
        : work.open_access?.oa_url ||
          work.primary_location?.landing_page_url ||
          work.id;

    return {
      id: work.id,
      title: work.title || 'Untitled',
      authors: (work.authorships || []).slice(0, 6).map((a) => a.author.display_name),
      year: work.publication_year || null,
      citationCount: work.cited_by_count || 0,
      abstract: reconstructAbstract(work.abstract_inverted_index),
      url,
      source: 'openalex',
      doi: work.doi,
      workType: work.type,
    };
  });

  return { papers, total: data.meta?.count || 0 };
}

// Fetch concept graph by searching the query term directly in OpenAlex concepts
export async function fetchTopicConceptGraph(query: string): Promise<ConceptGraph> {
  // Step 1: Search for the best matching concept for this query
  const searchParams = new URLSearchParams({
    search: query,
    sort: 'works_count:desc',
    'per-page': '1',
    select: 'id,display_name,level,ancestors,related_concepts,description,works_count',
    mailto: MAILTO,
  });

  const searchRes = await fetch(`${BASE_URL}/concepts?${searchParams}`, {
    next: { revalidate: 3600 },
  });

  if (!searchRes.ok) return { nodes: [], links: [] };
  const searchData = await searchRes.json();
  if (!searchData.results?.length) return { nodes: [], links: [] };

  const main: OAConcept = searchData.results[0];
  const nodesMap = new Map<string, ConceptNode>();
  const links: ConceptLink[] = [];
  const seenLinks = new Set<string>();

  const addLink = (sourceId: string, targetId: string, type: 'broader' | 'related') => {
    const key = `${sourceId}→${targetId}`;
    if (!seenLinks.has(key)) {
      seenLinks.add(key);
      links.push({ source: sourceId, target: targetId, type });
    }
  };

  // Add the main concept (marked with isMain)
  nodesMap.set(main.id, {
    id: main.id,
    name: main.display_name,
    level: main.level,
    score: 1.0,
    worksCount: main.works_count || 0,
    description: main.description,
    isMain: true,
  });

  // Add ancestors (broader concepts) as parents
  for (const ancestor of main.ancestors || []) {
    nodesMap.set(ancestor.id, {
      id: ancestor.id,
      name: ancestor.display_name,
      level: ancestor.level,
      score: 0.6,
      worksCount: 0,
    });
    // Link: ancestor → main (broader flows down to main)
    addLink(ancestor.id, main.id, 'broader');
  }

  // Link ancestors to each other (parent → child in the chain)
  const ancestors = main.ancestors || [];
  for (let i = 0; i < ancestors.length; i++) {
    for (let j = i + 1; j < ancestors.length; j++) {
      if (ancestors[i].level < ancestors[j].level) {
        addLink(ancestors[i].id, ancestors[j].id, 'broader');
      }
    }
  }

  // Add related concepts (narrower / sibling topics)
  const related = (main.related_concepts || [])
    .filter((r) => r.score > 0.3)
    .slice(0, 12);

  for (const rel of related) {
    nodesMap.set(rel.id, {
      id: rel.id,
      name: rel.display_name,
      level: rel.level,
      score: rel.score,
      worksCount: 0,
    });
    // Related concepts link from main outward
    addLink(main.id, rel.id, 'related');
  }

  return { nodes: Array.from(nodesMap.values()), links };
}
