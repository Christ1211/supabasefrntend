import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, assertConfigured } from '@/lib/supabase';
import { parseDataParams, applyDataFilters } from '@/lib/query';
import { isReadable, isWritable, isValidIdent } from '@/lib/sources';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

// LIST
export async function GET(req: NextRequest) {
  const { deny } = await requireUser();
  if (deny) return deny;
  try {
    assertConfigured();
    const sp = req.nextUrl.searchParams;
    const source = sp.get('source') ?? '';
    if (!isReadable(source)) return bad('Invalid or non-readable source');

    const p = parseDataParams(sp);
    const from = (p.page - 1) * p.pageSize;
    const to = from + p.pageSize - 1;

    let query = supabaseAdmin.from(source).select('*', { count: 'exact' });
    query = applyDataFilters(query, p);
    query = query.order(p.sort, { ascending: p.order === 'asc', nullsFirst: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      rows: data ?? [],
      total: count ?? 0,
      page: p.page,
      pageSize: p.pageSize,
      totalPages: count ? Math.ceil(count / p.pageSize) : 0,
      writable: isWritable(source),
    });
  } catch (err: any) {
    return bad(err.message ?? String(err), 500);
  }
}

// CREATE
export async function POST(req: NextRequest) {
  const { deny } = await requireUser();
  if (deny) return deny;
  try {
    assertConfigured();
    const body = await req.json();
    const source = body?.source ?? '';
    if (!isWritable(source)) return bad('Source is not writable');
    const values = sanitize(body?.values);
    if (!values) return bad('No values provided');

    const { data, error } = await supabaseAdmin.from(source).insert(values).select();
    if (error) throw error;
    const inserted = data?.[0] ?? null;

    return NextResponse.json({ row: inserted });
  } catch (err: any) {
    return bad(err.message ?? String(err), 500);
  }
}

// UPDATE
export async function PATCH(req: NextRequest) {
  const { deny } = await requireUser();
  if (deny) return deny;
  try {
    assertConfigured();
    const body = await req.json();
    const source = body?.source ?? '';
    if (!isWritable(source)) return bad('Source is not writable');
    const id = body?.id;
    if (!id) return bad('Missing id');
    const values = sanitize(body?.values);
    if (!values) return bad('No values provided');
    delete (values as any).id;

    const { data, error } = await supabaseAdmin.from(source).update(values).eq('id', id).select();
    if (error) throw error;
    return NextResponse.json({ row: data?.[0] ?? null });
  } catch (err: any) {
    return bad(err.message ?? String(err), 500);
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { deny } = await requireUser();
  if (deny) return deny;
  try {
    assertConfigured();
    const sp = req.nextUrl.searchParams;
    const source = sp.get('source') ?? '';
    const id = sp.get('id');
    if (!isWritable(source)) return bad('Source is not writable');
    if (!id) return bad('Missing id');

    const { error } = await supabaseAdmin.from(source).delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return bad(err.message ?? String(err), 500);
  }
}

// Only keep keys that are valid column identifiers; drop empty-string → null.
function sanitize(values: unknown): Record<string, unknown> | null {
  if (!values || typeof values !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    if (!isValidIdent(k)) continue;
    out[k] = v === '' ? null : v;
  }
  return Object.keys(out).length ? out : null;
}
