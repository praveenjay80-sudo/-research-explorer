import { Paper, ConceptNode, ConceptLink, ConceptGraph } from '@/types';

const BASE_URL = 'https://api.openalex.org';
const MAILTO = 'praveen.jay80@gmail.com';

interface OAWork {
  id: string;
  title: string;
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
  description?: string;
  works_count: number;
  cited_by_count: number;
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
): Promise<{
  papers: Paper[];
  conceptScores: Map<string, { node: ConceptNode; score: number }>;
  total: number;
}> {
  const params = new URLSearchParams({
    search: query,
    sort: 'cited_by_count:desc',
    'per-page': String(perPage),
    page: String(page),
    select: 'id,title,authorships,publication_year,cited_by_count,concepts,abstract_inverted_index,doi,open_access,primary_location',
    mailto: MAILTO,
  });

  const res = await fetch(`${BASE_URL}/works?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`OpenAlex API error: ${res.status}`);
  const data = await res.json();

  const conceptScores = new Map<string, { node: ConceptNode; score: number }>();

  const papers: Paper[] = ((data.results as OAWork[]) || []).map((work) => {
    const workConceptIds: string[] = [];

    for (const c of work.concepts || []) {
      workConceptIds.push(c.id);
      const existing = conceptScores.get(c.id);
      if (!existing || c.score > existing.score) {
        conceptScores.set(c.id, {
          node: {
            id: c.id,
            name: c.display_name,
            level: c.level,
            score: c.score,
            worksCount: 0,
          },
          score: c.score,
        });
      }
    }

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
      concepts: workConceptIds,
    };
  });

  return { papers, conceptScores, total: data.meta?.count || 0 };
}

export async function fetchConceptGraph(conceptIds: string[]): Promise<ConceptGraph> {
  if (conceptIds.length === 0) return { nodes: [], links: [] };

  const ids = conceptIds
    .slice(0, 25)
    .map((id) => id.replace('https://openalex.org/', ''))
    .join('|');

  const params = new URLSearchParams({
    filter: `openalex_id:${ids}`,
    select: 'id,display_name,level,ancestors,description,works_count',
    'per-page': '25',
    mailto: MAILTO,
  });

  const res = await fetch(`${BASE_URL}/concepts?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { nodes: [], links: [] };
  const data = await res.json();

  const nodesMap = new Map<string, ConceptNode>();
  const links: ConceptLink[] = [];
  const seenLinks = new Set<string>();

  for (const concept of (data.results as OAConcept[]) || []) {
    nodesMap.set(concept.id, {
      id: concept.id,
      name: concept.display_name,
      level: concept.level,
      score: 1,
      worksCount: concept.works_count || 0,
      description: concept.description,
    });

    for (const ancestor of concept.ancestors || []) {
      if (!nodesMap.has(ancestor.id)) {
        nodesMap.set(ancestor.id, {
          id: ancestor.id,
          name: ancestor.display_name,
          level: ancestor.level,
          score: 0.4,
          worksCount: 0,
        });
      }

      const linkKey = `${concept.id}→${ancestor.id}`;
      if (!seenLinks.has(linkKey)) {
        seenLinks.add(linkKey);
        links.push({ source: concept.id, target: ancestor.id, type: 'broader' });
      }
    }
  }

  return { nodes: Array.from(nodesMap.values()), links };
}
