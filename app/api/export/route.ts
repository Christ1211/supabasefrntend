import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, assertConfigured } from '@/lib/supabase';
import { parseDataParams, applyDataFilters } from '@/lib/query';
import { isReadable } from '@/lib/sources';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const EXPORT_CAP = 10000;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// CSV export of the current filtered/sorted result set (capped), auth-guarded.
export async function GET(req: NextRequest) {
  const { deny } = await requireUser();
  if (deny) return deny;
  try {
    assertConfigured();
    const sp = req.nextUrl.searchParams;
    const source = sp.get('source') ?? '';
    if (!isReadable(source)) return NextResponse.json({ error: 'Invalid source' }, { status: 400 });

    const p = parseDataParams(sp);
    const lines: string[] = [];
    let header: string[] | null = null;
    const batch = 1000;
    let fetched = 0;

    while (fetched < EXPORT_CAP) {
      const from = fetched;
      const to = Math.min(fetched + batch, EXPORT_CAP) - 1;
      let query = supabaseAdmin.from(source).select('*');
      query = applyDataFilters(query, p);
      query = query.order(p.sort, { ascending: p.order === 'asc', nullsFirst: false }).range(from, to);

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;

      if (!header) {
        header = Object.keys(data[0]);
        lines.push(header.join(','));
      }
      for (const row of data as any[]) {
        lines.push(header.map((c) => csvCell(row[c])).join(','));
      }
      fetched += data.length;
      if (data.length < batch) break;
    }

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${source}_export.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
