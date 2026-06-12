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
  authorships?: Array<{ author?: { display_name?: string } }>;
}

function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return '';
  const pairs: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) pairs.push([pos, word]);
  }
  return pairs.sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(' ').slice(0, 400);
}

async function fetchTopicWorks(subfield: string): Promise<OAWork[]> {
  try {
    const topicParams = new URLSearchParams({ search: subfield, 'per-page': '3', mailto: MAILTO });
    const topicRes = await fetch(`${OA_BASE}/topics?${topicParams}`, { next: { revalidate: 86400 } });
    if (!topicRes.ok) return [];
    const topics = ((await topicRes.json()).results ?? []) as Array<{ id: string }>;
    if (!topics.length) return [];
    const topicId = topics[0].id.replace('https://openalex.org/', '');
    const wp = new URLSearchParams({
      'per-page': '15', sort: 'cited_by_count:desc', mailto: MAILTO,
      select: 'id,title,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index,authorships',
    });
    const worksRes = await fetch(`${OA_BASE}/works?filter=topics.id:${topicId}&${wp}`, { next: { revalidate: 86400 } });
    return worksRes.ok ? ((await worksRes.json()).results ?? []) : [];
  } catch { return []; }
}

async function fetchAuthorTopWorks(name: string): Promise<OAWork[]> {
  try {
    const ap = new URLSearchParams({ search: name, 'per-page': '3', select: 'id,display_name,cited_by_count', mailto: MAILTO });
    const aRes = await fetch(`${OA_BASE}/authors?${ap}`, { next: { revalidate: 86400 } });
    if (!aRes.ok) return [];
    const candidates = ((await aRes.json()).results ?? []) as Array<{ id: string }>;
    if (!candidates.length) return [];
    const shortId = candidates[0].id.replace('https://openalex.org/', '');
    const wp = new URLSearchParams({
      'per-page': '3', sort: 'cited_by_count:desc', mailto: MAILTO,
      select: 'id,title,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index,authorships',
    });
    const wRes = await fetch(`${OA_BASE}/works?filter=authorships.author.id:${shortId}&${wp}`, { next: { revalidate: 86400 } });
    return wRes.ok ? ((await wRes.json()).results ?? []) : [];
  } catch { return []; }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 500 });

  const { field, subfield, topScientists } = await req.json() as {
    field: string;
    subfield: string;
    topScientists: Array<{ name: string; institution: string; citations: number }>;
  };

  const [topicWorks, ...scientistWorkArrays] = await Promise.all([
    fetchTopicWorks(subfield),
    ...topScientists.slice(0, 5).map((s) => fetchAuthorTopWorks(s.name)),
  ]);

  const seen = new Set<string>();
  const allWorks: OAWork[] = [];
  for (const w of [...topicWorks, ...scientistWorkArrays.flat()]) {
    const key = (w.title ?? '').toLowerCase().slice(0, 60);
    if (key && !seen.has(key)) { seen.add(key); allWorks.push(w); }
  }
  allWorks.sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0));
  const papers = allWorks.slice(0, 20);

  const scientistList = topScientists.slice(0, 8)
    .map((s) => `- ${s.name} (${s.institution})`)
    .join('\n');

  const papersBlock = papers.map((w, i) => {
    const abstract = reconstructAbstract(w.abstract_inverted_index);
    const authors = (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean).join(', ');
    const journal = w.primary_location?.source?.display_name ?? '';
    return [
      `[${i + 1}] "${w.title ?? 'Untitled'}" — ${authors}${w.publication_year ? ` (${w.publication_year})` : ''}`,
      `    Cited ${(w.cited_by_count ?? 0).toLocaleString()} times${journal ? ` · ${journal}` : ''}`,
      abstract ? `    Abstract: ${abstract}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const prompt = `You are explaining "${subfield}" (part of ${field}) to a curious, intelligent person who has never read an academic paper.

Context — world's most-cited researchers in this subfield:
${scientistList}

Most-cited papers from OpenAlex (use only if genuinely influential):
${papersBlock || 'None retrieved.'}

Write two things only:

PART 1 — OVERVIEW
1–2 paragraphs in plain English: what ${subfield} is, what questions it tries to answer, and why it matters to real people. Explain every technical term the moment you use it. Vivid and concrete.

PART 2 — READING LIST
List ONLY the most influential books and papers a newcomer must read to understand this field — the works that every expert has read, that shaped how the field thinks, and that are still worth reading today. This means landmark papers, foundational textbooks, and important review articles. Do NOT list obscure or narrow papers just because they appeared in the OpenAlex data above.

Draw primarily on your knowledge of what is genuinely influential in ${subfield}. If any papers from the OpenAlex list above are truly landmark works, include them. Otherwise ignore them.

Order the list so each entry builds on what came before — start with the most accessible and end with the most advanced.

For each entry use exactly this format:
[number]. "Title" — Author(s) (Year) [Book / Paper / Review]
→ What it established: [one sentence]
→ Read after: [entry number(s), or "nothing — start here"]

Rules:
- Only include works that a leading expert in ${subfield} would immediately recognise as essential
- Include books where they are more influential than papers (many fields have defining textbooks)
- Plain English. Every technical term explained in parentheses on first use
- Do not pad the list — 6 to 15 entries is right for most fields
- Do not cut off before the list is complete`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    return NextResponse.json({
      text,
      papers: papers.map((w) => ({
        title: w.title,
        year: w.publication_year,
        citations: w.cited_by_count,
        journal: w.primary_location?.source?.display_name,
        doi: w.doi,
        authors: (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
