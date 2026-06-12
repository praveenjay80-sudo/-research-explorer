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
  return pairs.sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(' ').slice(0, 600);
}

async function lookupAuthorOnOpenAlex(name: string, institution: string): Promise<{
  author: OAAuthor | null;
  topWorks: OAWork[];
}> {
  try {
    // Search by name
    const searchParams = new URLSearchParams({
      search: name,
      'per-page': '5',
      select: 'id,display_name,last_known_institutions,cited_by_count,works_count,summary_stats,topics',
      mailto: MAILTO,
    });
    const authRes = await fetch(`${OA_BASE}/authors?${searchParams}`, { next: { revalidate: 86400 } });
    if (!authRes.ok) return { author: null, topWorks: [] };
    const authData = await authRes.json();
    const candidates: OAAuthor[] = authData.results ?? [];
    if (candidates.length === 0) return { author: null, topWorks: [] };

    // Pick the best match — prefer one whose institution name overlaps
    const instLower = institution.toLowerCase();
    const ranked = candidates.sort((a, b) => {
      const aInst = a.last_known_institutions?.[0]?.display_name?.toLowerCase() ?? '';
      const bInst = b.last_known_institutions?.[0]?.display_name?.toLowerCase() ?? '';
      const aMatch = instLower && aInst.includes(instLower.split(' ')[0]) ? 1 : 0;
      const bMatch = instLower && bInst.includes(instLower.split(' ')[0]) ? 1 : 0;
      return bMatch - aMatch;
    });
    const author = ranked[0];

    // Fetch top 5 most-cited works with abstracts
    const authorShortId = author.id.replace('https://openalex.org/', '');
    const worksParams = new URLSearchParams({
      filter: `authorships.author.id:${authorShortId}`,
      sort: 'cited_by_count:desc',
      'per-page': '5',
      select: 'id,title,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index',
      mailto: MAILTO,
    });
    const worksRes = await fetch(`${OA_BASE}/works?${worksParams}`, { next: { revalidate: 86400 } });
    if (!worksRes.ok) return { author, topWorks: [] };
    const worksData = await worksRes.json();
    return { author, topWorks: worksData.results ?? [] };
  } catch {
    return { author: null, topWorks: [] };
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

  const { name, institution, field, subfield, citations, hIndex, works, cScore, firstYear, lastYear, selfShare } = body;
  const careerSpan = firstYear && lastYear ? `${firstYear}–${lastYear}` : firstYear ? `since ${firstYear}` : '';

  // Enrich with OpenAlex data
  const { author: oaAuthor, topWorks } = await lookupAuthorOnOpenAlex(name, institution);

  // Build works section
  const workLines = topWorks.map((w, i) => {
    const abstract = reconstructAbstract(w.abstract_inverted_index);
    const journal = w.primary_location?.source?.display_name ?? '';
    return [
      `${i + 1}. "${w.title ?? 'Untitled'}"${w.publication_year ? ` (${w.publication_year})` : ''}`,
      `   Citations: ${(w.cited_by_count ?? 0).toLocaleString()}${journal ? ` · Published in: ${journal}` : ''}`,
      abstract ? `   Abstract excerpt: ${abstract}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const oaTopics = oaAuthor?.topics?.slice(0, 6).map((t) => t.display_name).join(', ') ?? '';

  const prompt = `You are writing a detailed, structured profile of a scientist for someone who has never read an academic paper. Use clear, everyday language throughout — explain every technical term the moment you use it.

## Scientist data

Name: ${name}
Institution: ${institution}
Field: ${field} → ${subfield}
Career citations: ${citations.toLocaleString()} (every time another scientist's paper references their work counts as one citation)
H-index: ${hIndex} (means they have ${hIndex} papers each cited at least ${hIndex} times)
Total papers: ${works.toLocaleString()}${careerSpan ? `\nActive years: ${careerSpan}` : ''}${cScore !== undefined ? `\nC-score: ${cScore.toFixed(3)} (composite impact metric — higher = more influential)` : ''}${selfShare !== undefined ? `\nSelf-citation share: ${(selfShare * 100).toFixed(0)}% (${selfShare < 0.15 ? 'low — good sign' : selfShare < 0.3 ? 'moderate' : 'relatively high'})` : ''}${oaTopics ? `\nResearch topics: ${oaTopics}` : ''}

${topWorks.length > 0 ? `## Most cited publications\n\n${workLines}` : ''}

## Your task

Write a profile with exactly these five sections. Use the section headers exactly as shown. Keep the language simple enough for a curious teenager.

**Who is this scientist?**
2–3 sentences. Where do they work, what broad area of science do they work in, and how long have they been active? Explain what their field studies in one plain sentence.

**What problems do they work on?**
2–3 sentences. What specific questions or challenges does their research address? Why do these problems matter to ordinary people (health, technology, environment, etc.)?

**Most influential work**
3–4 sentences. Describe their single most-cited paper (the first one listed above if available). What question did it ask? What did it discover or create? Why did so many other scientists find it important enough to cite? Avoid equations — use analogies.

**Key contributions to their field**
3–4 sentences. Summarise the pattern across their top papers. What ideas, methods, tools, or discoveries have they introduced or advanced? How has their field changed because of their work?

**Why it matters**
2–3 sentences. Connect their research to real-world impact — medical treatments, technologies, policy, everyday life. Who ultimately benefits from this work and how?

Rules:
- Base every claim on the data provided above. Do not invent awards, prizes, university degrees, or biographical facts not listed.
- If no publication data is available, write the "Most influential work" section based on their field and subfield instead.
- Explain every technical term the first time you use it (e.g. "machine learning — a way of teaching computers to recognise patterns without being explicitly programmed").
- Never use phrases like "groundbreaking", "pioneering", "revolutionary", "seminal" — show impact through facts and numbers instead.`;

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
      enriched: !!oaAuthor,
      topWorks: topWorks.map((w) => ({
        title: w.title,
        year: w.publication_year,
        citations: w.cited_by_count,
        journal: w.primary_location?.source?.display_name,
        doi: w.doi,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
