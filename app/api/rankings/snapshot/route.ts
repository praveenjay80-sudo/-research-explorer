import { NextRequest, NextResponse } from 'next/server';
import { fetchRankedScientists } from '@/lib/rankings';
import fs from 'fs';
import path from 'path';
import type { SnapshotData } from '@/types/rankings';

function snapshotPath(subfieldId: string, year: number) {
  const safeId = subfieldId.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(process.cwd(), 'data', 'snapshots', `${safeId}-${year}.json`);
}

function snapshotDir() {
  return path.join(process.cwd(), 'data', 'snapshots');
}

// GET /api/rankings/snapshot?subfieldId=... — list years with saved snapshots
export async function GET(req: NextRequest) {
  const subfieldId = req.nextUrl.searchParams.get('subfieldId') ?? '';
  if (!subfieldId) return NextResponse.json({ years: [] });

  const dir = snapshotDir();
  if (!fs.existsSync(dir)) return NextResponse.json({ years: [] });

  const safeId = subfieldId.replace(/[^a-zA-Z0-9]/g, '_');
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(safeId + '-') && f.endsWith('.json'));
  const years = files
    .map((f) => parseInt(f.replace(`${safeId}-`, '').replace('.json', ''), 10))
    .filter((y) => !isNaN(y))
    .sort();

  return NextResponse.json({ years });
}

// POST /api/rankings/snapshot — capture current OpenAlex data for this subfield+year
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    subfieldId: string;
    subfieldName: string;
    fieldId: string;
    fieldName: string;
    year: number;
  };

  const { subfieldId, subfieldName, fieldId, fieldName, year } = body;
  if (!subfieldId || !year) {
    return NextResponse.json({ error: 'subfieldId and year required' }, { status: 400 });
  }

  // Fetch top 200 scientists (4 pages × 50)
  const pages = await Promise.all(
    [1, 2, 3, 4].map((p) =>
      fetchRankedScientists(subfieldId, p, fieldName, fieldId, subfieldName).catch(() => ({
        scientists: [],
        total: 0,
      }))
    )
  );

  const allScientists = pages.flatMap((p) => p.scientists).map((s, i) => ({ ...s, rank: i + 1 }));
  const total = pages[0]?.total ?? allScientists.length;

  const snapshot: SnapshotData = {
    subfieldId,
    subfieldName,
    fieldId,
    fieldName,
    year,
    capturedAt: new Date().toISOString(),
    source: 'openalex',
    scientists: allScientists,
    total,
  };

  const dir = snapshotDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(snapshotPath(subfieldId, year), JSON.stringify(snapshot, null, 2), 'utf-8');

  return NextResponse.json({ success: true, count: allScientists.length, year, capturedAt: snapshot.capturedAt });
}
