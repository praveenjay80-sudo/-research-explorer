import { NextResponse } from 'next/server';
import { fetchFields } from '@/lib/rankings';

export async function GET() {
  try {
    const fields = await fetchFields();
    return NextResponse.json({ fields });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch fields' }, { status: 500 });
  }
}
