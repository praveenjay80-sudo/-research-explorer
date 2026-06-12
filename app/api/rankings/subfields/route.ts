import { NextRequest, NextResponse } from 'next/server';
import { fetchSubfields } from '@/lib/rankings';

export async function GET(req: NextRequest) {
  const fieldId   = req.nextUrl.searchParams.get('fieldId') ?? '';
  const fieldName = req.nextUrl.searchParams.get('fieldName') ?? '';
  if (!fieldId || !fieldName) return NextResponse.json({ error: 'fieldId and fieldName required' }, { status: 400 });

  try {
    const subfields = await fetchSubfields(fieldId, fieldName);
    return NextResponse.json({ subfields });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch subfields' }, { status: 500 });
  }
}
