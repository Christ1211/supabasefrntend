import { isValidIdent } from './sources';

const ALLOWED_OPS = new Set(['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'ilike', 'is']);

export interface FilterClause {
  col: string;
  op: string;
  val: string;
}

export interface DataParams {
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
  q: string;
  searchCols: string[];
  filters: FilterClause[];
}

function coerce(v: string): string | number | boolean | null {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  return v;
}

export function parseDataParams(sp: URLSearchParams): DataParams {
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(sp.get('pageSize') ?? '50', 10) || 50));
  const sortRaw = sp.get('sort') ?? '';
  const sort = isValidIdent(sortRaw) ? sortRaw : 'id';
  const order = sp.get('order') === 'asc' ? 'asc' : 'desc';
  const q = (sp.get('q') ?? '').trim();
  const searchCols = (sp.get('searchCols') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isValidIdent(s));

  let filters: FilterClause[] = [];
  const raw = sp.get('filters');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        filters = parsed.filter(
          (f) => f && isValidIdent(f.col) && ALLOWED_OPS.has(f.op) && f.val !== undefined,
        );
      }
    } catch {
      /* ignore malformed filters */
    }
  }

  return { page, pageSize, sort, order, q, searchCols, filters };
}

// Applies search + filters to a supabase query builder.
export function applyDataFilters<T>(query: T, p: DataParams): T {
  let qb = query as any;

  if (p.q && p.searchCols.length) {
    const safe = p.q.replace(/[%,()]/g, ' ');
    qb = qb.or(p.searchCols.map((c) => `${c}.ilike.%${safe}%`).join(','));
  }

  for (const f of p.filters) {
    const val = coerce(f.val);
    switch (f.op) {
      case 'eq': qb = qb.eq(f.col, val); break;
      case 'neq': qb = qb.neq(f.col, val); break;
      case 'gte': qb = qb.gte(f.col, val); break;
      case 'lte': qb = qb.lte(f.col, val); break;
      case 'gt': qb = qb.gt(f.col, val); break;
      case 'lt': qb = qb.lt(f.col, val); break;
      case 'ilike': qb = qb.ilike(f.col, `%${val}%`); break;
      case 'is': qb = qb.is(f.col, val); break;
    }
  }
  return qb as T;
}
