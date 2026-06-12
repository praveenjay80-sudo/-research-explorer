import { NextRequest, NextResponse } from 'next/server';
import { fetchRankedScientists } from '@/lib/rankings';
import fs from 'fs';
import path from 'path';
import type { StanfordYearData, SnapshotData, RankedScientist } from '@/types/rankings';

function stanfordPath(year: number) {
  return path.join(process.cwd(), 'data', 'stanford', `${year}.json`);
}

function snapshotPath(subfieldId: string, year: number) {
  const safeId = subfieldId.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(process.cwd(), 'data', 'snapshots', `${safeId}-${year}.json`);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const subfieldId = p.get('subfieldId') ?? '';
  const fieldName  = p.get('fieldName') ?? '';
  const fieldId    = p.get('fieldId') ?? '';
  const subfieldName = p.get('subfieldName') ?? '';
  const year = parseInt(p.get('year') ?? '0', 10);
  const page = Math.max(1, parseInt(p.get('page') ?? '1', 10));

  if (!subfieldId) {
    return NextResponse.json({ error: 'subfieldId required' }, { status: 400 });
  }

  // 1. Check for official Stanford data
  if (year) {
    const spath = stanfordPath(year);
    if (fs.existsSync(spath)) {
      const raw: StanfordYearData = JSON.parse(fs.readFileSync(spath, 'utf-8'));
      const filtered = raw.entries.filter(
        (e) =>
          (!subfieldName || e.subfield.toLowerCase().includes(subfieldName.toLowerCase())) &&
          (!fieldName || e.field.toLowerCase().includes(fieldName.toLowerCase()))
      );
      const offset = (page - 1) * 50;
      const slice = filtered.slice(offset, offset + 50);
      const scientists: RankedScientist[] = slice.map((e, i) => ({
        rank: offset + i + 1,
        openAlexId: e.openAlexId ?? '',
        name: e.name,
        institution: e.institution,
        country: e.country,
        citedByCount: e.citedByCount,
        fieldCitedByCount: e.citedByCount, // Stanford uses career total as ranking basis
        worksCount: e.worksCount,
        hIndex: e.hIndex,
        field: e.field,
        fieldId,
        subfield: e.subfield,
        subfieldId,
        cScore: e.cScore,
        dataSource: 'stanford',
      }));
      return NextResponse.json({ scientists, total: filtered.length, page, dataSource: 'stanford', year });
    }

    // 2. Check for OpenAlex snapshot
    const snap = snapshotPath(subfieldId, year);
    if (fs.existsSync(snap)) {
      const data: SnapshotData = JSON.parse(fs.readFileSync(snap, 'utf-8'));
      const offset = (page - 1) * 50;
      const slice = data.scientists.slice(offset, offset + 50).map((s, i) => ({
        ...s,
        rank: offset + i + 1,
      }));
      return NextResponse.json({
        scientists: slice,
        total: data.total,
        page,
        dataSource: 'snapshot',
        year,
        capturedAt: data.capturedAt,
      });
    }
  }

  // 3. Live OpenAlex query
  try {
    const result = await fetchRankedScientists(subfieldId, page, fieldName, fieldId, subfieldName);
    return NextResponse.json({ ...result, page, dataSource: 'openalex', year: year || new Date().getFullYear() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
