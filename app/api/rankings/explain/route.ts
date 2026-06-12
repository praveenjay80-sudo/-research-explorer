import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const OA_BASE = 'https://api.openalex.org';
const MAILTO = 'praveen.jay80@gmail.com';

interface OAWork {
  id: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  primary_location?: { source?: { display_name?: string } };
  abstract_inverted_index?: Record<string, number[]>;
}

interface OAAuthor {
  id: string;
  display_name: string;
  last_known_institutions?: Array<{ display_name: string }>;
  cited_by_count?: number;
  works_count?: number;
  summary_stats?: { h_index?: number };
  topics?: Array<{ display_name: string; subfield?: { display_name: string }; field?: { display_name: string } }>;
}

function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return '';
  const pairs: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) pairs.push([pos, word]);
  }
  return pairs.sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(' ').slice(0, 500);
}

// Normalise a name for comparison: remove punctuation, lowercase, sort tokens
function normaliseName(n: string): string[] {
  return n.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter((t) => t.length > 1);
}

function nameOverlap(a: string, b: string): number {
  const ta = new Set(normaliseName(a));
  const tb = new Set(normaliseName(b));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size, 1);
}

async function lookupAuthor(name: string, institution: string, targetCitations: number): Promise<{
  author: OAAuthor | null;
  topWorks: OAWork[];
  confident: boolean;
}> {
  try {
    const params = new URLSearchParams({
      search: name,
      'per-page': '10',
      select: 'id,display_name,last_known_institutions,cited_by_count,works_count,summary_stats,topics',
      mailto: MAILTO,
    });
    const res = await fetch(`${OA_BASE}/authors?${params}`, { next: { revalidate: 86400 } });
    if (!res.ok) return { author: null, topWorks: [], confident: false };
    const data = await res.json();
    const candidates: OAAuthor[] = data.results ?? [];

    // Score each candidate: name overlap + citation count proximity + institution overlap
    const scored = candidates.map((c) => {
      const nameSim = nameOverlap(name, c.display_name);
      const oaCites = c.cited_by_count ?? 0;
      // Citation ratio — must be within 3× either way for any confidence
      const citesRatio = targetCitations > 500
        ? Math.min(oaCites, targetCitations) / Math.max(oaCites, targetCitations)
        : 1; // don't penalise if target is small/unknown
      const instSim = institution && c.last_known_institutions?.[0]
        ? nameOverlap(institution, c.last_known_institutions[0].display_name)
        : 0;
      const score = nameSim * 0.5 + citesRatio * 0.35 + instSim * 0.15;
      return { candidate: c, score, nameSim, citesRatio };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    // Require a minimum confidence to avoid writing about the wrong person
    // nameSim must be ≥ 0.4 (last name matches) AND citesRatio ≥ 0.25
    const confident =
      best &&
      best.nameSim >= 0.4 &&
      (targetCitations < 500 || best.citesRatio >= 0.25);

    if (!confident) return { author: null, topWorks: [], confident: false };

    const author = best.candidate;
    const shortId = author.id.replace('https://openalex.org/', '');
    const worksParams = new URLSearchParams({
      filter: `authorships.author.id:${shortId}`,
      sort: 'cited_by_count:desc',
      'per-page': '5',
      select: 'id,title,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index',
      mailto: MAILTO,
    });
    const worksRes = await fetch(`${OA_BASE}/works?${worksParams}`, { next: { revalidate: 86400 } });
    const topWorks: OAWork[] = worksRes.ok ? ((await worksRes.json()).results ?? []) : [];

    return { author, topWorks, confident: true };
  } catch {
    return { author: null, topWorks: [], confident: false };
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 500 });

  const body = await req.json() as {
    name: string;
    institution: string;
    country?: string;
    field: string;
    subfield: string;
    citations: number;
    hIndex: number;
    works: number;
    cScore?: number;
    firstYear?: number;
    lastYear?: number;
    selfShare?: number;
  };

  const { name, institution, field, subfield, citations, hIndex, works,
          cScore, firstYear, lastYear, selfShare } = body;
  const careerSpan = firstYear && lastYear ? `${firstYear}–${lastYear}` : firstYear ? `since ${firstYear}` : '';

  const { author: oaAuthor, topWorks, confident } = await lookupAuthor(name, institution, citations);

  // Build works block only when we're confident it's the right person
  let worksBlock = '';
  if (confident && topWorks.length > 0) {
    worksBlock = topWorks.map((w, i) => {
      const abstract = reconstructAbstract(w.abstract_inverted_index);
      const journal = w.primary_location?.source?.display_name ?? '';
      return [
        `${i + 1}. "${w.title ?? 'Untitled'}"${w.publication_year ? ` (${w.publication_year})` : ''}`,
        `   Cited by ${(w.cited_by_count ?? 0).toLocaleString()} papers${journal ? ` · ${journal}` : ''}`,
        abstract ? `   Abstract: ${abstract}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');
  }

  const oaTopics = (confident && oaAuthor?.topics)
    ? oaAuthor.topics.slice(0, 5).map((t) => t.display_name).join(', ')
    : '';

  const prompt = `You are writing a detailed scientist profile for someone who has never read an academic paper. Use plain, everyday language. Explain every technical term the moment you use it.

## Data for ${name}

Institution: ${institution}
Research area: ${field} › ${subfield}
Career citations: ${citations.toLocaleString()} (the number of times other scientists have referenced their work)
H-index: ${hIndex} (means they have ${hIndex} papers each cited ≥${hIndex} times by other researchers)
Total published papers: ${works.toLocaleString()}${careerSpan ? `\nActive career: ${careerSpan}` : ''}${cScore !== undefined ? `\nC-score: ${cScore.toFixed(3)} (composite impact metric used by Stanford; higher = more influential globally)` : ''}${selfShare !== undefined ? `\nSelf-citation rate: ${(selfShare * 100).toFixed(0)}%` : ''}${oaTopics ? `\nSpecific research topics: ${oaTopics}` : ''}

${worksBlock ? `## Their actual most-cited publications (use these for the "Most Influential Work" section)\n\n${worksBlock}` : '## Note: No verified publication data available — do NOT invent specific paper titles or findings. Describe the type of work researchers in this subfield typically do instead.'}

## Write a profile with exactly these five section headings

**Who is this scientist?**
2–3 sentences. State their name, institution, and the field they work in — described in plain terms. Mention how long they have been active if known.

**What problems do they work on?**
2–3 sentences. Describe the specific scientific questions or real-world challenges their subfield addresses. Connect it to why ordinary people should care (health, technology, environment, safety, etc.).

**Most influential work**
3–4 sentences. ${worksBlock
  ? 'Describe their single most-cited paper listed above. What question did it ask? What did it find or create? Why did so many other researchers cite it? Use an everyday analogy — no equations.'
  : 'Describe the type of research that top researchers in this subfield typically pursue. What kinds of questions do they investigate and what methods do they use? Be general — do NOT invent specific paper titles or results.'}

**Key contributions to their field**
3–4 sentences. Based on their career metrics and research area, describe what a scientist with this profile likely contributed to their field. What ideas, tools, or methods does their subfield rely on? How has the field changed in their career period?

**Why it matters**
2–3 sentences. Connect this area of research to concrete real-world benefits — medical treatments developed, technologies created, lives improved, policies informed. Be specific to the subfield.

## Rules
- Every fact must come from the data above. Do not invent awards, university degrees, specific collaborators, or paper titles not listed.
- Explain every technical term immediately in parentheses.
- Never use: "groundbreaking", "pioneering", "revolutionary", "seminal", "landmark" — show impact through numbers instead.
- Write as if explaining to a curious 16-year-old.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    return NextResponse.json({
      explanation: text,
      enriched: confident,
      topWorks: confident ? topWorks.map((w) => ({
        title: w.title,
        year: w.publication_year,
        citations: w.cited_by_count,
        journal: w.primary_location?.source?.display_name,
        doi: w.doi,
      })) : [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
