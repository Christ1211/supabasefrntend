'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import {
  SOURCES,
  SEARCH_COLUMNS,
  ENUM_FILTERS,
  BOOL_FILTERS,
  BOOL_COLUMNS,
  AUTO_COLUMNS,
  PAGE_SIZES,
  FIELD_TYPES,
} from '@/lib/schema';

interface ApiResp {
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  writable: boolean;
  error?: string;
}
type Toast = { id: number; msg: string; kind: 'ok' | 'err' };
type DrawerMode = 'view' | 'edit' | 'create' | null;

function fmtCell(v: any) {
  if (v === null || v === undefined) return <span className="pill gray">—</span>;
  if (v === true) return <span className="bool-yes">✔</span>;
  if (v === false) return <span className="bool-no">—</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function Explorer({ userEmail }: { userEmail: string }) {
  const router = useRouter();

  const [source, setSource] = useState('webinar_registrants');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [bools, setBools] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('id');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [data, setData] = useState<ApiResp | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [drawerRow, setDrawerRow] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  // ---- persist the current view across refreshes (localStorage) ----
  const STORAGE_KEY = 'webinar-admin:view';
  const [hydrated, setHydrated] = useState(false);

  // restore once on mount, before the first fetch fires
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.source === 'string') setSource(s.source);
        if (s.filters && typeof s.filters === 'object') setFilters(s.filters);
        if (s.bools && typeof s.bools === 'object') setBools(s.bools);
        if (typeof s.dateFrom === 'string') setDateFrom(s.dateFrom);
        if (typeof s.dateTo === 'string') setDateTo(s.dateTo);
        if (typeof s.sort === 'string') setSort(s.sort);
        if (s.order === 'asc' || s.order === 'desc') setOrder(s.order);
        if (typeof s.pageSize === 'number') setPageSize(s.pageSize);
        if (typeof s.searchInput === 'string') {
          setSearchInput(s.searchInput);
          setQ(s.searchInput.trim());
        }
        if (typeof s.page === 'number') setPage(s.page);
      }
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // save whenever the view changes (after hydration so we don't clobber it)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ source, filters, bools, dateFrom, dateTo, sort, order, page, pageSize, searchInput }),
      );
    } catch {
      /* storage unavailable (private mode / quota) — non-fatal */
    }
  }, [hydrated, source, filters, bools, dateFrom, dateTo, sort, order, page, pageSize, searchInput]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const presentSearchCols = useMemo(
    () => SEARCH_COLUMNS.filter((c) => columns.includes(c)),
    [columns],
  );

  const buildParams = useCallback(
    (forExport = false) => {
      const sp = new URLSearchParams();
      sp.set('source', source);
      if (q && presentSearchCols.length) {
        sp.set('q', q);
        sp.set('searchCols', presentSearchCols.join(','));
      }
      const clauses: { col: string; op: string; val: string }[] = [];
      for (const [k, v] of Object.entries(filters)) if (v) clauses.push({ col: k, op: 'eq', val: v });
      for (const [k, v] of Object.entries(bools)) if (v) clauses.push({ col: k, op: 'eq', val: v });
      if (dateFrom && columns.includes('registration_date'))
        clauses.push({ col: 'registration_date', op: 'gte', val: dateFrom });
      if (dateTo && columns.includes('registration_date'))
        clauses.push({ col: 'registration_date', op: 'lte', val: dateTo });
      if (clauses.length) sp.set('filters', JSON.stringify(clauses));
      sp.set('sort', sort);
      sp.set('order', order);
      if (!forExport) {
        sp.set('page', String(page));
        sp.set('pageSize', String(pageSize));
      }
      return sp;
    },
    [source, q, presentSearchCols, filters, bools, dateFrom, dateTo, sort, order, page, pageSize, columns],
  );

  const reqId = useRef(0);
  useEffect(() => {
    if (!hydrated) return; // wait for the saved view to be restored first
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    fetch('/api/data?' + buildParams().toString())
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (id !== reqId.current) return;
        if (d.error) {
          setError(d.error);
          setData(null);
        } else {
          setData(d);
          if (d.rows.length) setColumns(Object.keys(d.rows[0]));
        }
      })
      .catch((e) => id === reqId.current && setError(String(e)))
      .finally(() => id === reqId.current && setLoading(false));
  }, [buildParams, hydrated]);

  function changeSource(next: string) {
    setSource(next);
    setColumns([]);
    setFilters({});
    setBools({});
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setQ('');
    setSort('id');
    setOrder('desc');
    setPage(1);
  }

  function toggleSort(col: string) {
    if (sort === col) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(col);
      setOrder('asc');
    }
    setPage(1);
  }

  const writable = data?.writable ?? false;
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const fromRow = total ? (page - 1) * pageSize + 1 : 0;
  const toRow = Math.min(page * pageSize, total);

  const activeFilters = useMemo(() => {
    let n = 0;
    if (q) n++;
    n += Object.values(filters).filter(Boolean).length;
    n += Object.values(bools).filter(Boolean).length;
    if (dateFrom) n++;
    if (dateTo) n++;
    return n;
  }, [q, filters, bools, dateFrom, dateTo]);

  function clearFilters() {
    setFilters({});
    setBools({});
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setQ('');
    setPage(1);
  }

  async function logout() {
    await createSupabaseBrowser().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // ---- CRUD ----
  function openCreate() {
    const blank: any = {};
    columns.forEach((c) => (blank[c] = ''));
    setDrawerRow(blank);
    setDrawer('create');
  }
  function openRow(row: any) {
    setDrawerRow(row);
    setDrawer(writable ? 'edit' : 'view');
  }
  function closeDrawer() {
    setDrawer(null);
    setDrawerRow(null);
  }

  async function saveDrawer() {
    const form = document.getElementById('drawerForm') as HTMLFormElement | null;
    if (!form) return;
    const values: Record<string, any> = {};
    form.querySelectorAll<HTMLElement>('[data-col]').forEach((el) => {
      const col = el.getAttribute('data-col')!;
      const v = (el as HTMLInputElement).value;
      values[col] = v === '' ? null : v === 'true' ? true : v === 'false' ? false : v;
    });
    setSaving(true);
    try {
      let res: Response;
      if (drawer === 'create') {
        res = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, values }),
        });
      } else {
        res = await fetch('/api/data', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, id: drawerRow.id, values }),
        });
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      if (drawer === 'create' && source === 'webinar_events') {
        toast('Webinar created', 'ok');
        if (j.webhook) {
          if (j.webhook.ok) toast('Triggered backfill of unregistered leads onto this webinar', 'ok');
          else toast('Webinar saved, but the backfill webhook failed: ' + (j.webhook.error || `HTTP ${j.webhook.status}`), 'err');
        }
      } else {
        toast(drawer === 'create' ? 'Row created' : 'Row updated', 'ok');
      }
      closeDrawer();
      refetch();
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(row: any) {
    if (!confirm(`Delete row id ${row.id}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/data?source=${encodeURIComponent(source)}&id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Delete failed');
      toast('Row deleted', 'ok');
      refetch();
    } catch (e: any) {
      toast(e.message, 'err');
    }
  }

  // manual refetch (after writes)
  const refetch = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true);
    fetch('/api/data?' + buildParams().toString())
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (id !== reqId.current) return;
        if (d.error) setError(d.error);
        else {
          setData(d);
          if (d.rows.length) setColumns(Object.keys(d.rows[0]));
        }
      })
      .finally(() => id === reqId.current && setLoading(false));
  }, [buildParams]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="logo">▦</span>
          <h1>Webinar Admin</h1>
        </div>
        <input
          className="search"
          placeholder="Search email, name, phone…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <span className="spacer" />
        {loading && <span className="spin" />}
        <span className="badge">{total.toLocaleString()} rows</span>
        <span className={`badge ${writable ? 'rw' : 'ro'}`}>
          {writable ? 'editable' : 'read-only'}
        </span>
        <a href={'/api/export?' + buildParams(true).toString()}>
          <button>⬇ Export CSV</button>
        </a>
        {writable && (
          <button className="primary" onClick={openCreate}>
            {source === 'webinar_events' ? '+ New webinar' : '+ New'}
          </button>
        )}
        <span className="userbar">
          <span className="who">{userEmail}</span>
          <button onClick={logout}>Log out</button>
        </span>
      </div>

      <div className="tabstrip">
        {SOURCES.map((s) => (
          <button
            key={s.name}
            className={`tab ${source === s.name ? 'active' : ''}`}
            onClick={() => source !== s.name && changeSource(s.name)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="filterbar">
        {ENUM_FILTERS.filter((f) => columns.includes(f.key)).map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <select
              value={filters[f.key] ?? ''}
              onChange={(e) => {
                setFilters((p) => ({ ...p, [f.key]: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
        {BOOL_FILTERS.filter((b) => columns.includes(b.key)).map((b) => (
          <div className="field" key={b.key}>
            <label>{b.label}</label>
            <select
              value={bools[b.key] ?? ''}
              onChange={(e) => {
                setBools((p) => ({ ...p, [b.key]: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        ))}
        {columns.includes('registration_date') && (
          <>
            <div className="field">
              <label>Registered From</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="field">
              <label>Registered To</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>
          </>
        )}
        {activeFilters > 0 && (
          <div className="field">
            <label>&nbsp;</label>
            <button className="btn-clear" onClick={clearFilters}>
              ✕ Clear ({activeFilters})
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        {error ? (
          <div className="state error">Error: {error}</div>
        ) : !data ? (
          <div className="state">Loading…</div>
        ) : data.rows.length === 0 ? (
          <div className="state">No rows match.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: writable ? 110 : 60 }}>actions</th>
                {columns.map((c) => (
                  <th key={c} onClick={() => toggleSort(c)}>
                    {c}
                    {sort === c && <span className="sort-ind">{order === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td className="rowbtns">
                    <button onClick={() => openRow(row)}>{writable ? 'Edit' : 'View'}</button>
                    {writable && (
                      <button className="danger" onClick={() => deleteRow(row)}>
                        Del
                      </button>
                    )}
                  </td>
                  {columns.map((c) => (
                    <td key={c} title={String(row[c] ?? '')}>
                      {fmtCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="footer">
        <div className="pager">
          <button disabled={page <= 1} onClick={() => setPage(1)}>« First</button>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <span className="info">
            {fromRow.toLocaleString()}–{toRow.toLocaleString()} of {total.toLocaleString()}
          </span>
          <button disabled={totalPages > 0 && page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
          <button disabled={totalPages > 0 && page >= totalPages} onClick={() => setPage(totalPages)}>Last »</button>
        </div>
        <span className="spacer" />
        <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <label style={{ textTransform: 'none' }}>Rows / page</label>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {drawer && drawerRow && (
        <DrawerForm
          mode={drawer}
          row={drawerRow}
          columns={columns}
          source={source}
          saving={saving}
          onClose={closeDrawer}
          onSave={saveDrawer}
          onDelete={() => { closeDrawer(); deleteRow(drawerRow); }}
        />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}

function DrawerForm({
  mode, row, columns, source, saving, onClose, onSave, onDelete,
}: {
  mode: DrawerMode; row: any; columns: string[]; source: string; saving: boolean;
  onClose: () => void; onSave: () => void; onDelete: () => void;
}) {
  // Esc to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const ro = mode === 'view';
  const cols = mode === 'create' ? columns.filter((c) => !AUTO_COLUMNS.includes(c)) : columns;

  function input(col: string) {
    const val = row[col];
    const disabled = ro || (mode === 'edit' && col === 'id');

    // New webinars are always "Scheduled" — fixed, not a dropdown.
    if (col === 'webinar_status' && mode === 'create') {
      return <input className="field-in" data-col={col} defaultValue="Scheduled" disabled />;
    }

    if (BOOL_COLUMNS.includes(col)) {
      return (
        <select className="field-in" data-col={col} defaultValue={val === true ? 'true' : val === false ? 'false' : ''} disabled={disabled}>
          <option value="">(null)</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    const ft = FIELD_TYPES[col];
    if (ft?.type === 'enum') {
      const opts = [...(ft.options ?? [])];
      if (val && !opts.includes(val)) opts.push(val); // keep any legacy value selectable
      return (
        <select className="field-in" data-col={col} defaultValue={val ?? ''} disabled={disabled}>
          <option value="">(null)</option>
          {opts.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    if (ft?.type === 'date') {
      const d = val ? String(val).slice(0, 10) : '';
      return <input type="date" className="field-in" data-col={col} defaultValue={d} disabled={disabled} />;
    }
    if (ft?.type === 'datetime') {
      const dt = val ? String(val).slice(0, 16) : ''; // YYYY-MM-DDTHH:mm
      return <input type="datetime-local" className="field-in" data-col={col} defaultValue={dt} disabled={disabled} />;
    }

    const str = val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.length > 60) {
      return <textarea className="field-in" data-col={col} defaultValue={str} disabled={disabled} />;
    }
    return <input className="field-in" data-col={col} defaultValue={str} disabled={disabled} />;
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <button className="close" onClick={onClose}>✕</button>
        <h2>
          {mode === 'create' ? 'New row' : mode === 'edit' ? 'Edit row' : 'Row detail'}
          {ro && <span className="readonly-tag"> · read-only view</span>}
        </h2>
        <div className="sub">{source}{row.id ? ` · ${row.id}` : ''}</div>
        <form id="drawerForm" onSubmit={(e) => e.preventDefault()}>
          {cols.map((c) => (
            <div className="frow" key={c}>
              <span className="k">{c}</span>
              {input(c)}
            </div>
          ))}
        </form>
        {!ro && (
          <div className="actions">
            <button className="primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onClose}>Cancel</button>
            {mode === 'edit' && (
              <button className="danger" style={{ marginLeft: 'auto' }} onClick={onDelete}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
