import type {
  OAField,
  OASubfield,
  RankedScientist,
  ScientistProfile,
  ScientistWork,
  CitationYear,
} from '@/types/rankings';

const BASE = 'https://api.openalex.org';
const MAILTO = 'praveen.jay80@gmail.com';
const PER_PAGE = 50;

function shortId(fullId: string): string {
  return fullId.replace('https://openalex.org/', '');
}

export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const pts = [...code.toUpperCase()].map((c) => c.codePointAt(0)! + 127397);
  return String.fromCodePoint(...pts);
}

export function formatCitations(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Fields / Subfields via OpenAlex Concepts (level 1 = fields, level 2 = subfields) ──
// We use the stable x_concepts system because the Authors endpoint supports
// filtering by x_concepts.id but not by topics.subfield.id.

export async function fetchFields(): Promise<OAField[]> {
  // Level-0 = broadest domains (~19), closest to Science-Metrix's 22 fields
  const filter = 'level:0';
  const rest = new URLSearchParams({
    'per-page': '100',
    sort: 'works_count:desc',
    select: 'id,display_name,works_count',
    mailto: MAILTO,
  });
  const res = await fetch(`${BASE}/concepts?filter=${filter}&${rest.toString()}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const results = (data.results ?? []) as OAField[];
  return results.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

// Search for level-1 concepts (subfields) by the parent field name.
// The OpenAlex concepts API doesn't reliably support ancestor-based filtering,
// so we use a name search which finds semantically related level-1 concepts.
export async function fetchSubfields(fieldId: string, fieldName: string): Promise<OASubfield[]> {
  const filter = 'level:1';
  const rest = new URLSearchParams({
    search: fieldName,
    'per-page': '50',
    sort: 'works_count:desc',
    select: 'id,display_name,works_count',
    mailto: MAILTO,
  });
  const res = await fetch(`${BASE}/concepts?filter=${filter}&${rest.toString()}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const results = (data.results ?? []) as Array<{ id: string; display_name: string; works_count: number }>;
  return results.map((r) => ({
    id: r.id,
    display_name: r.display_name,
    works_count: r.works_count,
    field: { id: fieldId, display_name: fieldName },
  }));
}

// ── Authors / Rankings ───────────────────────────────────────────────────────

interface OARawAuthor {
  id: string;
  display_name: string;
  last_known_institutions?: Array<{ display_name: string; country_code: string }>;
  cited_by_count?: number;
  works_count?: number;
  summary_stats?: {
    h_index?: number;
    i10_index?: number;
    '2yr_mean_citedness'?: number;
  };
  topics?: Array<{
    id: string;
    display_name: string;
    subfield?: { id: string; display_name: string };
    field?: { id: string; display_name: string };
  }>;
  counts_by_year?: Array<{ year: number; works_count: number; cited_by_count: number }>;
  ids?: { orcid?: string; scopus?: string };
}

const AUTHOR_SELECT =
  'id,display_name,last_known_institutions,cited_by_count,works_count,summary_stats,topics';

export async function fetchRankedScientists(
  subfieldId: string,
  page = 1,
  fieldName = '',
  fieldId = '',
  subfieldName = '',
): Promise<{ scientists: RankedScientist[]; total: number }> {
  const targetShortId = shortId(subfieldId);

  // Step 1: Fetch the top 200 most-cited works tagged with this concept.
  //   Include concepts so we can filter by relevance score.
  const worksFilter = `concepts.id:${targetShortId}`;
  const worksParams = new URLSearchParams({
    sort: 'cited_by_count:desc',
    'per-page': '200',
    select: 'id,cited_by_count,authorships,concepts',
    mailto: MAILTO,
  });
  const worksRes = await fetch(`${BASE}/works?filter=${worksFilter}&${worksParams.toString()}`, {
    next: { revalidate: 3600 },
  });
  if (!worksRes.ok) {
    const body = await worksRes.text().catch(() => '');
    throw new Error(`OpenAlex works error: ${worksRes.status} — ${body.slice(0, 200)}`);
  }
  const worksData = await worksRes.json();

  type RawWork = {
    cited_by_count: number;
    authorships: Array<{ author: { id: string } }>;
    concepts: Array<{ id: string; score: number }> | null;
  };
  const allWorks = (worksData.results ?? []) as RawWork[];

  // Step 2: Keep only works where this concept is genuinely central (score ≥ 0.3).
  //   This prevents cross-field bleed — e.g. Hinton's ML papers that are only
  //   tangentially tagged with "Mathematical Analysis" at score ~0.05 are excluded,
  //   while legitimate papers with even modest relevance are included.
  const works = allWorks.filter((w) => {
    if (!w.concepts) return true; // keep if concept data missing
    const c = w.concepts.find((c) => shortId(c.id) === targetShortId);
    return c ? c.score >= 0.3 : false;
  });

  if (works.length === 0) return { scientists: [], total: 0 };

  // Step 3: Aggregate field-specific citations per author from those filtered works.
  const fieldCitations = new Map<string, number>();
  for (const w of works) {
    for (const a of w.authorships ?? []) {
      const aid = a.author?.id;
      if (!aid) continue;
      fieldCitations.set(aid, (fieldCitations.get(aid) ?? 0) + w.cited_by_count);
    }
  }

  // Sort by field citations — NOT career total — so only domain-relevant
  // researchers rank highly (fixes Hinton appearing in Mathematical Analysis).
  const ranked = [...fieldCitations.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);

  const topIds = ranked.map(([id]) => shortId(id));
  if (topIds.length === 0) return { scientists: [], total: 0 };

  // Step 4: Fetch full author profiles for career metrics (name, h-index, institution…).
  const authorFilter = `ids.openalex:${topIds.join('|')}`;
  const authorParams = new URLSearchParams({
    'per-page': '100',
    select: AUTHOR_SELECT,
    mailto: MAILTO,
  });
  const authorRes = await fetch(`${BASE}/authors?filter=${authorFilter}&${authorParams.toString()}`, {
    next: { revalidate: 3600 },
  });
  if (!authorRes.ok) throw new Error(`OpenAlex author lookup error: ${authorRes.status}`);
  const authorData = await authorRes.json();

  // Build lookup map by short ID
  const profileMap = new Map<string, OARawAuthor>();
  for (const a of (authorData.results ?? []) as OARawAuthor[]) {
    profileMap.set(shortId(a.id), a);
  }

  // Step 5: Re-sort by field citations and paginate.
  const offset = (page - 1) * PER_PAGE;
  const pageSlice = ranked.slice(offset, offset + PER_PAGE);

  const scientists: RankedScientist[] = [];
  for (let i = 0; i < pageSlice.length; i++) {
    const [fullId, fieldCites] = pageSlice[i];
    const sid = shortId(fullId);
    const a = profileMap.get(sid);
    if (!a) continue;
    const inst = a.last_known_institutions?.[0];
    const pt = a.topics?.[0];
    scientists.push({
      rank: offset + i + 1,
      openAlexId: sid,
      name: a.display_name,
      institution: inst?.display_name ?? 'Unknown Institution',
      country: inst?.country_code ?? '',
      citedByCount: a.cited_by_count ?? 0,
      fieldCitedByCount: fieldCites,
      worksCount: a.works_count ?? 0,
      hIndex: a.summary_stats?.h_index ?? 0,
      field: fieldName || (pt?.field?.display_name ?? ''),
      fieldId: fieldId || (pt?.field?.id ?? ''),
      subfield: subfieldName || (pt?.subfield?.display_name ?? ''),
      subfieldId,
      dataSource: 'openalex',
    });
  }

  return { scientists, total: ranked.length };
}

// ── Single author profile ────────────────────────────────────────────────────

export async function fetchScientistProfile(authorId: string): Promise<ScientistProfile | null> {
  const [profileRes, worksData] = await Promise.all([
    fetch(`${BASE}/authors/${authorId}?mailto=${MAILTO}`, { next: { revalidate: 3600 } }),
    fetchAuthorTopWorks(authorId),
  ]);
  if (!profileRes.ok) return null;
  const a: OARawAuthor = await profileRes.json();

  const inst = a.last_known_institutions?.[0];
  const pt = a.topics?.[0];
  const topics = (a.topics ?? []).slice(0, 8).map((t) => t.display_name);
  const byYear = (a.counts_by_year ?? []).sort((x, y) => x.year - y.year);
  const years = byYear.map((c) => c.year);

  // Parse Scopus/ORCID from ids object
  const ids = a.ids as Record<string, string> | undefined;
  const orcid = ids?.orcid?.replace('https://orcid.org/', '');
  const scopusRaw = ids?.scopus ?? '';
  const scopusId = scopusRaw.includes('authorId=')
    ? scopusRaw.split('authorId=')[1]
    : scopusRaw;

  return {
    openAlexId: authorId,
    name: a.display_name,
    institution: inst?.display_name ?? 'Unknown Institution',
    country: inst?.country_code ?? '',
    citedByCount: a.cited_by_count ?? 0,
    worksCount: a.works_count ?? 0,
    hIndex: a.summary_stats?.h_index ?? 0,
    i10Index: a.summary_stats?.i10_index ?? 0,
    twoYrMeanCitedness: a.summary_stats?.['2yr_mean_citedness'] ?? 0,
    field: pt?.field?.display_name ?? '',
    fieldId: pt?.field?.id ?? '',
    subfield: pt?.subfield?.display_name ?? '',
    subfieldId: pt?.subfield?.id ?? '',
    firstYear: years[0],
    lastYear: years[years.length - 1],
    orcid,
    scopusId: scopusId || undefined,
    topics,
    citationsByYear: byYear.slice(-12) as CitationYear[],
    topWorks: worksData,
    dataSource: 'openalex',
  };
}

interface OARawWork {
  id: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
  open_access?: { oa_url?: string };
}

export async function fetchAuthorTopWorks(authorId: string, limit = 10): Promise<ScientistWork[]> {
  const filter = `authorships.author.id:${authorId}`;
  const rest = new URLSearchParams({
    sort: 'cited_by_count:desc',
    'per-page': String(limit),
    select: 'id,title,publication_year,cited_by_count,doi,primary_location,open_access',
    mailto: MAILTO,
  });
  const res = await fetch(`${BASE}/works?filter=${filter}&${rest.toString()}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const data = await res.json();

  return ((data.results ?? []) as OARawWork[]).map((w) => ({
    id: w.id,
    title: w.title ?? 'Untitled',
    year: w.publication_year ?? null,
    citationCount: w.cited_by_count ?? 0,
    doi: w.doi,
    journal: w.primary_location?.source?.display_name,
    url: w.doi
      ? `https://doi.org/${w.doi}`
      : w.open_access?.oa_url ||
        w.primary_location?.landing_page_url ||
        `https://openalex.org/${w.id}`,
  }));
}
