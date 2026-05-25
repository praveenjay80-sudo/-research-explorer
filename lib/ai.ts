import Anthropic from '@anthropic-ai/sdk';
import type { Reference } from './semanticScholar';

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export interface KeywordMap {
  broader: string[];
  related: string[];
  narrower: string[];
}

export async function generateKeywords(
  query: string,
  paperTitles: string[]
): Promise<KeywordMap | null> {
  const ai = getClient();
  if (!ai) return null;

  const titlesText = paperTitles
    .slice(0, 12)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n');

  try {
    const message = await ai.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Research topic: "${query}"

Top papers found:
${titlesText}

Generate academic keywords as JSON with three arrays:
- "broader": 3-4 parent disciplines that contain this topic
- "related": 5-7 peer concepts at the same specificity level
- "narrower": 5-7 specific sub-topics, methods, or applications within this area

Return ONLY valid JSON like: {"broader": [...], "related": [...], "narrower": [...]}`,
        },
      ],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    if (
      Array.isArray(parsed.broader) &&
      Array.isArray(parsed.related) &&
      Array.isArray(parsed.narrower)
    ) {
      return {
        broader: (parsed.broader as string[])
          .filter((s) => typeof s === 'string')
          .slice(0, 5),
        related: (parsed.related as string[])
          .filter((s) => typeof s === 'string')
          .slice(0, 8),
        narrower: (parsed.narrower as string[])
          .filter((s) => typeof s === 'string')
          .slice(0, 8),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export interface CuratedReference extends Reference {
  importance?: string;
}

export async function curateBibliography(
  paperTitle: string,
  references: Reference[]
): Promise<CuratedReference[] | null> {
  const ai = getClient();
  if (!ai) return null;
  if (references.length === 0) return [];

  const refList = references
    .slice(0, 60)
    .map(
      (r, i) =>
        `${i + 1}. "${r.title}" — ${r.authors.slice(0, 3).join(', ')}${r.year ? ` (${r.year})` : ''}, ${r.citationCount} citations`
    )
    .join('\n');

  try {
    const message = await ai.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `Paper: "${paperTitle}"

References listed:
${refList}

Select the 8 most significant references (foundational works, seminal papers, or directly relevant to this research). For each, write a 1-sentence explanation of its importance.

Return ONLY a JSON array: [{"index": 1, "importance": "Introduced the attention mechanism fundamental to this work."}, ...]`,
        },
      ],
    });

    const text =
      message.content[0].type === 'text' ? message.content[0].text : '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const selections: Array<{ index: number; importance: string }> = JSON.parse(
      match[0]
    );

    return selections
      .filter(
        (s) =>
          typeof s.index === 'number' &&
          s.index >= 1 &&
          s.index <= references.length &&
          typeof s.importance === 'string'
      )
      .slice(0, 10)
      .map((s) => ({
        ...references[s.index - 1],
        importance: s.importance,
      }));
  } catch {
    return null;
  }
}
