import { NextRequest, NextResponse } from 'next/server';
import { fetchScientistProfile } from '@/lib/rankings';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ authorId: string }> }
) {
  const { authorId } = await params;
  try {
    const profile = await fetchScientistProfile(authorId);
    if (!profile) return NextResponse.json({ error: 'Author not found' }, { status: 404 });
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
