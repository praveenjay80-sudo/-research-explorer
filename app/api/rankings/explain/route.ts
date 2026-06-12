import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
  const careerSpan = firstYear && lastYear ? `${firstYear}–${lastYear}` : '';

  const prompt = `You are explaining a scientist to a complete beginner — someone who has never read a research paper.

Scientist data:
- Name: ${name}
- Institution: ${institution}
- Field: ${field} > ${subfield}
- Total career citations: ${citations.toLocaleString()}
- H-index: ${hIndex}
- Total papers published: ${works.toLocaleString()}${careerSpan ? `\n- Active years: ${careerSpan}` : ''}${cScore !== undefined ? `\n- C-score (composite impact): ${cScore.toFixed(3)}` : ''}${selfShare !== undefined ? `\n- Self-citation share: ${(selfShare * 100).toFixed(0)}%` : ''}

Write a clear, friendly 4–5 sentence explanation that:
1. Says who this person is and what area of science they work in — use everyday language, no jargon
2. Explains what kind of problems their field tries to solve and why it matters to ordinary people
3. Uses the citation and h-index numbers to convey how influential they are (e.g. compare to a typical professor)
4. Explains their main contribution to their field in plain English
5. Ends with one sentence on why this work matters to society or medicine or technology

Rules:
- No jargon without immediate explanation
- Do not invent awards, prizes, or biographical facts not in the data above
- Write as if explaining to a curious 16-year-old
- Output only the explanation, no headers or formatting`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ explanation: text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
