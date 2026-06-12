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
  return pairs.sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(' ').slice(0, 600);
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
      'per-page': '20', sort: 'cited_by_count:desc', mailto: MAILTO,
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
    const candidates = ((await aRes.json()).results ?? []) as Array<{ id: string; display_name: string }>;
    if (!candidates.length) return [];

    const shortId = candidates[0].id.replace('https://openalex.org/', '');
    const wp = new URLSearchParams({
      'per-page': '5', sort: 'cited_by_count:desc', mailto: MAILTO,
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

  // Fetch topic papers + top scientist papers in parallel
  const [topicWorks, ...scientistWorkArrays] = await Promise.all([
    fetchTopicWorks(subfield),
    ...topScientists.slice(0, 6).map((s) => fetchAuthorTopWorks(s.name)),
  ]);

  // Merge, deduplicate by title, sort by citations
  const seen = new Set<string>();
  const allWorks: OAWork[] = [];
  for (const w of [...topicWorks, ...scientistWorkArrays.flat()]) {
    const key = (w.title ?? '').toLowerCase().slice(0, 60);
    if (key && !seen.has(key)) { seen.add(key); allWorks.push(w); }
  }
  allWorks.sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0));
  const papers = allWorks.slice(0, 30);

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

  const scientistList = topScientists.slice(0, 12)
    .map((s) => `- ${s.name} (${s.institution}) — ${s.citations.toLocaleString()} citations`)
    .join('\n');

  const prompt = `You are building a self-directed learning experience for an intelligent person with no academic background who wants to genuinely understand "${subfield}" (part of the broader field: ${field}).

## World's most-cited researchers in this subfield
${scientistList}

## Most-cited papers in this subfield (with abstracts where available)
${papersBlock || 'No papers retrieved — draw on your knowledge of this field.'}

---

Design a rich, natural curriculum. Do not impose arbitrary limits on how many concepts or papers to include — include everything that genuinely matters for a complete picture of this field, from first principles to the frontier. Be generous. A curious person deserves the real picture.

Write the following sections in order:

**Why this field matters**
The most visceral, compelling reason a non-scientist should care. Connect it to lives, technologies, or mysteries that touch ordinary people. Not generic — be specific to ${subfield}.

**The intellectual landscape**
What are the big questions this field is trying to answer? What would success look like — what would we be able to do or know? What makes these questions hard?

**Core concepts you need in your head first**
For each concept that a beginner genuinely needs before they can follow the literature: give it a name, explain it in one plain sentence, then give a concrete everyday analogy. Cover as many concepts as needed — skip nothing essential, include nothing unnecessary.

**Your reading path**
For every paper from the list above that belongs in a complete curriculum, and any essential classics not on the list (mark these "[Classic]"):

Title, Authors, Year — Cited X times
Difficulty: Beginner / Intermediate / Advanced
Read after: [paper number or "Start here"]
Why read this: [one sentence on what question it answers]
What you'll understand after: [one sentence on the insight]
[One sentence on why this paper specifically became so influential]

Order from most accessible to most technical. Group loosely by theme where natural.

**The open frontiers**
The biggest unsolved problems and active debates in ${subfield} right now. For each: what is the problem, why has it resisted solution, and what would cracking it change?

**The hidden connections**
Which other fields does ${subfield} draw from most heavily, and which fields has it most transformed? Include surprising connections that a newcomer wouldn't expect.

**If you want to go deeper**
Suggest 2–3 specific directions a genuinely curious person could take after finishing the reading path above — conferences, journals, online courses, or research groups that are at the frontier.

---

Rules:
- Write as if explaining to a brilliant, curious 20-year-old who has never read an academic paper
- Every technical term must be explained the moment it first appears, in parentheses
- Never use: "groundbreaking", "pioneering", "revolutionary", "seminal", "landmark"
- Show impact through numbers and concrete outcomes, not adjectives
- Be honest about what is not yet understood — mystery is interesting`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    return NextResponse.json({
      curriculum: text,
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
