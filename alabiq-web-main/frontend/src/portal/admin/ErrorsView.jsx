// ---------------------------------------------------------------------
// Admin Errors — the error_logs table (migration 0042), written by
// lib/errorLog.js from every console.error the API makes.
//
// The first paginated view in the portal. Other admin lists fetch a capped
// page and filter it in the browser; this table grows much faster than
// bookings, so it pages against the server.
// ---------------------------------------------------------------------
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  Inbox,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { toCsv, downloadCsv } from '../lib/csv';
import { formatDateTime } from '../lib/constants';
import { relativeTime } from '../lib/notifications';
import { Card, Badge, Spinner, btnPrimary, btnGhost, inputClass } from '../components/ui';

const PAGE_SIZE = 50;

const FILTERS = [
  { id: 'open', label: 'Open', hint: 'Not triaged yet', q: { status: 'open' }, icon: AlertTriangle },
  { id: 'today', label: 'Last 24h', hint: 'Errors in the last 24 hours', q: { status: 'all', since: '24h' }, icon: Flame },
  { id: 'fatal', label: 'Crashes', hint: 'Unhandled exceptions and rejections', q: { status: 'all', severity: 'fatal' }, icon: Flame },
  { id: 'resolved', label: 'Resolved', hint: 'Marked resolved by an admin', q: { status: 'resolved' }, icon: ShieldCheck },
  { id: 'all', label: 'All', hint: 'Every error still in the table', q: { status: 'all' }, icon: Inbox },
];

const EMPTY = {
  open: { title: 'No open errors', desc: 'Nothing is waiting to be triaged.', icon: ShieldCheck },
  today: { title: 'No errors today', desc: 'The API has not logged an error in the last 24 hours.', icon: ShieldCheck },
  fatal: { title: 'No crashes', desc: 'No unhandled exceptions or rejected promises.', icon: ShieldCheck },
  resolved: { title: 'Nothing resolved yet', desc: 'Errors you mark as resolved will collect here.', icon: Inbox },
  all: { title: 'No errors recorded', desc: 'The table is empty. If you expected rows, check that migration 0042 has been applied.', icon: Inbox },
};

const CSV_COLUMNS = [
  { key: 'occurred_at', header: 'occurred_at' },
  { key: 'severity', header: 'severity' },
  { key: 'label', header: 'label' },
  { key: 'message', header: 'message' },
  { key: 'method', header: 'method' },
  { key: 'path', header: 'path' },
  { key: 'user_email', header: 'user' },
  { key: 'user_role', header: 'role' },
  { key: 'occurrences', header: 'occurrences' },
  { key: 'request_id', header: 'request_id' },
];

function occurrencesOf(row) {
  return (row.suppressed_count || 0) + 1;
}

function buildQuery(filter, term, offset) {
  const params = new URLSearchParams({ ...filter.q, limit: String(PAGE_SIZE), offset: String(offset) });
  if (term) params.set('q', term);
  return `?${params.toString()}`;
}

function SeverityBadge({ severity }) {
  return severity === 'fatal'
    ? <Badge tone="red">Crash</Badge>
    : <Badge tone="amber">Error</Badge>;
}

// Public routes (health, auth, the Tap webhook) and the sweepers have
// nobody signed in, so a missing user is normal, not missing data.
function Who({ row }) {
  if (!row.user_email) {
    return <span className="text-brand-grey">Not signed in</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <User className="w-3.5 h-3.5 shrink-0 text-brand-grey" />
      <span className="truncate">{row.user_email}</span>
      {row.user_role && <Badge tone="grey">{row.user_role}</Badge>}
    </span>
  );
}

function Stat({ label, value, tone }) {
  return (
    <Card className="p-4 min-w-0">
      <p className="text-[11px] font-bold text-brand-grey uppercase tracking-wider">{label}</p>
      <p className={`text-lg sm:text-xl font-black tabular-nums mt-1 ${
        tone === 'red' ? 'text-red-600' : 'text-brand-black'
      }`}>
        {value}
      </p>
    </Card>
  );
}

function Detail({ id, onResolved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.adminErrorDetail(id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="p-5"><Spinner /></div>;
  if (!data) return <div className="p-5 text-sm text-brand-grey">Could not load this error.</div>;

  const row = data.error_log;
  const resolved = !!row.resolved_at;

  async function toggle() {
    setBusy(true);
    try {
      await api.adminResolveError(row.id, !resolved);
      onResolved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-5 bg-brand-surface border-t border-brand-border space-y-4">
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div><dt className="text-[11px] uppercase font-bold text-brand-grey">Request</dt>
          <dd className="font-mono text-xs break-all">{row.request_id || '—'}</dd></div>
        <div><dt className="text-[11px] uppercase font-bold text-brand-grey">Endpoint</dt>
          <dd className="font-mono text-xs break-all">{row.method || '—'} {row.path || ''}</dd></div>
        <div><dt className="text-[11px] uppercase font-bold text-brand-grey">Client IP</dt>
          <dd className="font-mono text-xs break-all">{row.ip || '—'}</dd></div>
        <div><dt className="text-[11px] uppercase font-bold text-brand-grey">Occurrences</dt>
          <dd className="tabular-nums font-bold">{occurrencesOf(row)}</dd></div>
      </dl>

      {row.stack && (
        <div>
          <p className="text-[11px] uppercase font-bold text-brand-grey mb-1.5">Stack trace</p>
          <pre className="text-[11px] leading-relaxed bg-white border border-brand-border rounded-xl p-3 overflow-x-auto whitespace-pre">
            {row.stack}
          </pre>
        </div>
      )}

      {!!data.related.length && (
        <div>
          <p className="text-[11px] uppercase font-bold text-brand-grey mb-1.5">
            Other times this error fired ({data.related.length})
          </p>
          <ul className="text-xs divide-y divide-brand-border border border-brand-border rounded-xl overflow-hidden bg-white">
            {data.related.map((r) => (
              <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-3">
                <span className="tabular-nums text-brand-grey shrink-0">{formatDateTime(r.occurred_at)}</span>
                <span className="truncate">{r.user_email || 'Not signed in'}</span>
                <span className="font-mono text-brand-grey truncate hidden sm:inline">{r.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={toggle} disabled={busy} className={resolved ? btnGhost : btnPrimary}>
          {resolved ? <><RotateCcw className="w-4 h-4 inline mr-1.5 -mt-0.5" />Reopen</>
                    : <><CheckCircle2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />Mark resolved</>}
        </button>
        {/* Resolving clears every row with the same fingerprint. Clearing
            one of two hundred identical rows would leave the list as long
            as before. */}
        <p className="text-xs text-brand-grey">
          {resolved
            ? `Resolved ${relativeTime(row.resolved_at)}.`
            : 'Clears every occurrence of this error.'}
        </p>
      </div>
    </div>
  );
}

export default function ErrorsView() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, errors: [] });
  const [summary, setSummary] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.adminErrors(buildQuery(filter, search, offset)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, search, offset]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.adminErrorSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  function pick(next) {
    setFilter(next);
    setOffset(0);
    setExpanded(null);
  }

  function submitSearch(e) {
    e.preventDefault();
    setSearch(term.trim());
    setOffset(0);
  }

  async function afterResolve() {
    setExpanded(null);
    await load();
    api.adminErrorSummary().then(setSummary).catch(() => {});
  }

  function exportCsv() {
    if (!rows.length) return;
    const flat = rows.map((r) => ({ ...r, occurrences: occurrencesOf(r) }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`alabiq-errors-${filter.id}-${stamp}.csv`, toCsv(flat, CSV_COLUMNS));
  }

  const rows = data.errors || [];
  const total = data.total || 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const empty = EMPTY[filter.id];
  const EmptyIcon = empty.icon;

  const topOffenders = useMemo(() => (summary?.top || []).slice(0, 3), [summary]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Open" value={summary ? summary.open : '—'} tone={summary?.open ? 'red' : undefined} />
        <Stat label="Last 24 hours" value={summary ? summary.last24h : '—'} />
        <Card className="p-4 col-span-2 min-w-0">
          <p className="text-[11px] font-bold text-brand-grey uppercase tracking-wider mb-1.5">
            Most frequent, last 24h
          </p>
          {topOffenders.length ? (
            <ul className="space-y-1">
              {topOffenders.map((t) => (
                <li key={t.fingerprint} className="flex items-baseline gap-2 text-sm min-w-0">
                  <span className="tabular-nums font-black text-brand-black shrink-0">{t.occurrences}x</span>
                  <span className="font-bold truncate">{t.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-grey">No repeat errors in the last 24 hours.</p>
          )}
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto snap-x pb-1">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const active = f.id === filter.id;
          return (
            <button
              key={f.id}
              type="button"
              title={f.hint}
              onClick={() => pick(f)}
              className={`snap-start shrink-0 inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-3.5 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                active
                  ? 'bg-brand-black text-white border-brand-black'
                  : 'bg-white text-brand-grey border-brand-border hover:text-brand-dark'
              }`}
            >
              <Icon className="w-4 h-4" />
              {f.label}
              {active && <span className="tabular-nums opacity-70">{total}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <form onSubmit={submitSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-grey pointer-events-none" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search message, endpoint, or user email"
              className={`${inputClass} pl-9`}
            />
          </div>
          <button type="submit" className={btnGhost}>Search</button>
        </form>
        <button type="button" onClick={exportCsv} disabled={!rows.length} className={btnGhost}>
          <Download className="w-4 h-4 inline mr-1.5 -mt-0.5" />CSV
        </button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Spinner /></div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <button type="button" onClick={load} className={`${btnGhost} mt-3`}>Try again</button>
          </div>
        ) : !rows.length ? (
          <div className="p-10 text-center">
            <EmptyIcon className="w-8 h-8 mx-auto text-brand-grey mb-2" />
            <p className="font-bold text-brand-black">{empty.title}</p>
            <p className="text-sm text-brand-grey mt-1">{empty.desc}</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface text-brand-grey text-[11px] uppercase">
                  <tr>
                    <th className="text-left px-5 py-2.5 font-bold">When</th>
                    <th className="text-left px-5 py-2.5 font-bold">Who</th>
                    <th className="text-left px-5 py-2.5 font-bold">What</th>
                    <th className="text-left px-5 py-2.5 font-bold">Where</th>
                    <th className="text-right px-5 py-2.5 font-bold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className={`border-t border-brand-border cursor-pointer hover:bg-brand-surface ${
                          r.resolved_at ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-5 py-2.5 whitespace-nowrap">
                          <span className="tabular-nums">{formatDateTime(r.occurred_at)}</span>
                          <span className="block text-[11px] text-brand-grey">{relativeTime(r.occurred_at)}</span>
                        </td>
                        <td className="px-5 py-2.5 max-w-[16rem]"><Who row={r} /></td>
                        <td className="px-5 py-2.5 max-w-md">
                          <span className="inline-flex items-center gap-2">
                            <SeverityBadge severity={r.severity} />
                            <span className="font-bold">{r.label}</span>
                          </span>
                          <span className="block text-brand-grey truncate">{r.message}</span>
                        </td>
                        <td className="px-5 py-2.5 font-mono text-xs text-brand-grey max-w-[14rem] truncate">
                          {r.method} {r.path}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums font-bold">{occurrencesOf(r)}</td>
                      </tr>
                      {expanded === r.id && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <Detail id={r.id} onResolved={afterResolve} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-brand-border md:hidden">
              {rows.map((r) => (
                <li key={r.id} className={r.resolved_at ? 'opacity-60' : ''}>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="w-full text-left px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <SeverityBadge severity={r.severity} />
                        <span className="font-bold truncate">{r.label}</span>
                      </span>
                      <span className="tabular-nums text-xs font-bold shrink-0">{occurrencesOf(r)}x</span>
                    </div>
                    <p className="text-sm text-brand-grey mt-1 line-clamp-2">{r.message}</p>
                    <p className="text-[11px] text-brand-grey mt-1.5 tabular-nums">
                      {formatDateTime(r.occurred_at)}
                    </p>
                    <p className="text-[11px] text-brand-grey mt-0.5 truncate"><Who row={r} /></p>
                  </button>
                  {expanded === r.id && <Detail id={r.id} onResolved={afterResolve} />}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-brand-border">
              <p className="text-xs text-brand-grey tabular-nums">
                Showing {offset + 1}-{pageEnd} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => { setOffset(Math.max(0, offset - PAGE_SIZE)); setExpanded(null); }}
                  className={`${btnGhost} disabled:opacity-40`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={pageEnd >= total}
                  onClick={() => { setOffset(offset + PAGE_SIZE); setExpanded(null); }}
                  className={`${btnGhost} disabled:opacity-40`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
