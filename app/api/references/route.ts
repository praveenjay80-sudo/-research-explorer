import { NextRequest, NextResponse } from 'next/server';
import { fetchReferences } from '@/lib/semanticScholar';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paperId = searchParams.get('paperId')?.trim();

  if (!paperId) {
    return NextResponse.json({ error: 'paperId required' }, { status: 400 });
  }

  try {
    const references = await fetchReferences(paperId);
    return NextResponse.json({ references });
  } catch {
    return NextResponse.json({ references: [] });
  }
}
