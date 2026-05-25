import { NextRequest, NextResponse } from 'next/server';
import { fetchReferences } from '@/lib/semanticScholar';
import { curateBibliography } from '@/lib/ai';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paperId = searchParams.get('paperId')?.trim();
  const title = searchParams.get('title')?.trim() ?? '';

  if (!paperId) {
    return NextResponse.json({ error: 'paperId required' }, { status: 400 });
  }

  try {
    const rawRefs = await fetchReferences(paperId);

    if (rawRefs.length === 0) {
      return NextResponse.json({ references: [], aiCurated: false });
    }

    // Try AI curation
    const curated = await curateBibliography(title, rawRefs);

    if (curated && curated.length > 0) {
      return NextResponse.json({ references: curated, aiCurated: true });
    }

    // Fallback: top references by citation count
    const sorted = [...rawRefs]
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 15);
    return NextResponse.json({ references: sorted, aiCurated: false });
  } catch {
    return NextResponse.json({ references: [], aiCurated: false });
  }
}
