import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 500 });

  const body = await req.json() as {
    name: string;
    institution: string;
    country: string;
    field: string;
    subfield: string;
    citedByCount: number;
    hIndex: number;
    worksCount: number;
    firstYear?: number;
    lastYear?: number;
    topics: string[];
    topWorks: Array<{ title: string; year: number | null; citationCount: number }>;
  };

  const { name, institution, country, field, subfield, citedByCount, hIndex, worksCount, firstYear, lastYear, topics, topWorks } = body;

  const worksList = topWorks
    .slice(0, 5)
    .map((w, i) => `${i + 1}. "${w.title}"${w.year ? ` (${w.year})` : ''} — ${w.citationCount.toLocaleString()} citations`)
    .join('\n');

  const careerSpan = firstYear && lastYear ? `${firstYear}–${lastYear}` : lastYear ? `until ${lastYear}` : '';

  const prompt = `Generate a brief scientific biography for ${name}, a researcher at ${institution}${country ? ` (${country})` : ''}.

Known data:
- Primary field: ${field} > ${subfield}
- Career citations: ${citedByCount.toLocaleString()}
- H-index: ${hIndex}
- Total publications: ${worksCount.toLocaleString()}${careerSpan ? `\n- Active: ${careerSpan}` : ''}
- Research topics: ${topics.slice(0, 6).join(', ')}
- Most cited works:
${worksList}

Write 3–4 sentences that:
1. Describe their position and institutional affiliation
2. Summarise their main research areas and scientific contributions
3. Note the impact of their work (grounded only in the data above)

Base the biography ONLY on the data provided above. Do not invent awards, prizes, or facts not listed.
Output only the biography text, no labels or formatting.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const bio = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ bio });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
