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

// Find the best-matching OpenAlex concept for a query string
export async function findBestConcept(query: string): Promise<OAConcept | null> {
  // Use default relevance sort — NOT works_count which returns broadest concepts
  const params = new URLSearchParams({
    search: query,
    'per-page': '5',
    select: 'id,display_name,level,ancestors,related_concepts,description,works_count',
    mailto: MAILTO,
  });
  const res = await fetch(`${BASE_URL}/concepts?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const results: OAConcept[] = data.results ?? [];
  if (!results.length) return null;

  const qWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  // Prefer concept whose name shares words with the query
  for (const concept of results) {
    const name = concept.display_name.toLowerCase();
    if (qWords.some((w) => name.includes(w))) return concept;
  }

  // If nothing matches by name, don't risk using the wrong concept
  return null;
}

function mapWork(work: OAWork): Paper {
  const url =
    work.doi
      ? `https://doi.org/${work.doi}`
      : work.open_access?.oa_url ||
        work.primary_location?.landing_page_url ||
        work.id;

  const type = work.type ?? 'article';
  const workType =
    type === 'book' || type === 'edited-book' || type === 'reference-book'
      ? 'book'
      : type === 'book-chapter'
      ? 'book-chapter'
      : 'article';

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
    workType,
  };
}

const WORK_FIELDS =
  'id,title,type,authorships,publication_year,cited_by_count,abstract_inverted_index,doi,open_access,primary_location';

// Search works by concept ID + text query combined (maximum precision)
async function fetchWorksByConcept(
  conceptId: string,
  query: string,
  page: number,
  perPage: number
): Promise<{ papers: Paper[]; total: number }> {
  const shortId = conceptId.replace('https://openalex.org/', '');

  const params = new URLSearchParams({
    search: query,                          // relevance match
    filter: `concepts.id:${shortId}`,      // must be tagged in this field
    sort: 'cited_by_count:desc',
    'per-page': String(perPage),
    page: String(page),
    select: WORK_FIELDS,
    mailto: MAILTO,
  });

  const res = await fetch(`${BASE_URL}/works?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`OpenAlex API error: ${res.status}`);
  const data = await res.json();

  return {
    papers: ((data.results as OAWork[]) || []).map(mapWork),
    total: data.meta?.count || 0,
  };
}

// Fallback: text search (used when no concept ID found)
async function fetchWorksBySearch(
  query: string,
  page: number,
  perPage: number
): Promise<{ papers: Paper[]; total: number }> {
  const params = new URLSearchParams({
    search: query,
    sort: 'cited_by_count:desc',
    'per-page': String(perPage),
    page: String(page),
    select: WORK_FIELDS,
    mailto: MAILTO,
  });

  const res = await fetch(`${BASE_URL}/works?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`OpenAlex API error: ${res.status}`);
  const data = await res.json();

  return {
    papers: ((data.results as OAWork[]) || []).map(mapWork),
    total: data.meta?.count || 0,
  };
}

export async function searchOpenAlex(
  query: string,
  page = 1,
  perPage = 100,
  conceptId?: string
): Promise<{ papers: Paper[]; total: number }> {
  if (conceptId) {
    return fetchWorksByConcept(conceptId, query, page, perPage);
  }
  return fetchWorksBySearch(query, page, perPage);
}

// Build concept graph centered on the query topic
export async function fetchTopicConceptGraph(
  query: string,
  concept?: OAConcept | null
): Promise<ConceptGraph> {
  const main = concept ?? (await findBestConcept(query));
  if (!main) return { nodes: [], links: [] };

  const nodesMap = new Map<string, ConceptNode>();
  const links: ConceptLink[] = [];
  const seenLinks = new Set<string>();

  const addLink = (src: string, tgt: string, type: 'broader' | 'related') => {
    const key = `${src}→${tgt}`;
    if (!seenLinks.has(key)) {
      seenLinks.add(key);
      links.push({ source: src, target: tgt, type });
    }
  };

  nodesMap.set(main.id, {
    id: main.id,
    name: main.display_name,
    level: main.level,
    score: 1.0,
    worksCount: main.works_count || 0,
    description: main.description,
    isMain: true,
  });

  // Ancestors (broader fields/subfields)
  for (const ancestor of main.ancestors || []) {
    nodesMap.set(ancestor.id, {
      id: ancestor.id,
      name: ancestor.display_name,
      level: ancestor.level,
      score: 0.6,
      worksCount: 0,
    });
    addLink(ancestor.id, main.id, 'broader');
  }

  // Link ancestors to each other by level
  const ancestors = main.ancestors || [];
  for (let i = 0; i < ancestors.length; i++) {
    for (let j = i + 1; j < ancestors.length; j++) {
      if (ancestors[i].level < ancestors[j].level) {
        addLink(ancestors[i].id, ancestors[j].id, 'broader');
      }
    }
  }

  // Related/narrower concepts
  const related = (main.related_concepts || [])
    .filter((r) => r.score > 0.25)
    .slice(0, 14);

  for (const rel of related) {
    nodesMap.set(rel.id, {
      id: rel.id,
      name: rel.display_name,
      level: rel.level,
      score: rel.score,
      worksCount: 0,
    });
    addLink(main.id, rel.id, 'related');
  }

  return { nodes: Array.from(nodesMap.values()), links };
}
