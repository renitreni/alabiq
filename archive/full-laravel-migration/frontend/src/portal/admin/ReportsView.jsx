// ---------------------------------------------------------------------
// Admin Reports — ride bookings and verified revenue over a time window,
// with a CSV of the underlying rows.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  CircleCheck,
  Ban,
  Banknote,
  Download,
  Inbox,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { toCsv, downloadCsv } from '../lib/csv';
import { fmtSAR } from '../lib/constants';
import { Card, Spinner, btnPrimary } from '../components/ui';

const REPORT_RANGES = [
  { id: 'day', label: 'Today', short: 'Today' },
  { id: 'month', label: '30 days', short: '30d' },
  { id: 'quarter', label: '3 months', short: '3mo' },
  { id: 'half', label: '6 months', short: '6mo' },
  { id: 'year', label: '1 year', short: '1y' },
];

const REPORT_CSV_COLUMNS = [
  'booking_code', 'created_at', 'booking_status', 'payment_status',
  'fare_amount', 'currency', 'trip_type', 'passenger_name',
].map((k) => ({ key: k, header: k }));

function formatRangeDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatBucket(bucket, granularity) {
  if (!bucket) return '';
  if (granularity === 'month') {
    const [y, m] = bucket.split('-').map(Number);
    if (!y || !m) return bucket;
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  const [y, m, d] = bucket.split('-').map(Number);
  if (!y || !m || !d) return bucket;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function Stat({ label, value, icon: Icon, hint, tone }) {
  return (
    <Card className="p-4 min-w-0">
      {Icon && (
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${
          tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-brand-muted text-brand-dark'
        }`}>
          <Icon className="w-4 h-4" />
        </span>
      )}
      <p className="text-[11px] font-bold text-brand-grey uppercase tracking-wider">{label}</p>
      <p className={`text-lg sm:text-xl font-black tabular-nums mt-1 break-words ${
        tone === 'red' ? 'text-red-600' : 'text-brand-black'
      }`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-brand-grey mt-1">{hint}</p>}
    </Card>
  );
}

export default function ReportsView() {
  const [range, setRange] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.adminReports(range)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  function exportCsv() {
    if (!data?.rows?.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`alabiq-report-${range}-${stamp}.csv`, toCsv(data.rows, REPORT_CSV_COLUMNS));
  }

  const t = data?.totals;
  const series = data?.series || [];
  const maxCount = useMemo(
    () => Math.max(1, ...series.map((s) => s.count || 0)),
    [series],
  );
  const maxRevenue = useMemo(
    () => Math.max(1, ...series.map((s) => s.revenue || 0)),
    [series],
  );
  const completionRate = t && t.bookings > 0
    ? Math.round((t.completed / t.bookings) * 100)
    : null;

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 flex-1 no-scrollbar">
          {REPORT_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`snap-start shrink-0 inline-flex items-center px-3.5 py-2.5 rounded-xl text-sm font-bold border cursor-pointer ${
                range === r.id
                  ? 'bg-brand-black text-white border-brand-black'
                  : 'bg-white text-brand-grey border-brand-border hover:text-brand-dark'
              }`}
            >
              <span className="sm:hidden">{r.short}</span>
              <span className="hidden sm:inline">{r.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data?.rows?.length}
          className={btnPrimary + ' w-full xl:w-auto justify-center !py-2.5 disabled:opacity-50'}
        >
          <Download className="w-4 h-4" /> Download CSV
        </button>
      </div>

      {error && (
        <Card className="p-4 text-red-600 text-sm font-medium">{error}</Card>
      )}

      {loading && !t && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Spinner className="!w-7 !h-7" />
          <p className="text-sm text-brand-grey">Loading report…</p>
        </div>
      )}

      {t && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Bookings"
              value={t.bookings}
              icon={ClipboardList}
              hint="Placed in this range"
            />
            <Stat
              label="Completed"
              value={t.completed}
              icon={CircleCheck}
              hint={completionRate != null ? `${completionRate}% of bookings` : 'Finished rides'}
            />
            <Stat
              label="Cancelled"
              value={t.cancelled}
              icon={Ban}
              tone={t.cancelled > 0 ? 'red' : undefined}
              hint="Dropped before completion"
            />
            <Stat
              label="Revenue"
              value={fmtSAR(t.revenue)}
              icon={Banknote}
              hint="Verified payments only"
            />
          </div>

          <Card className="p-0 overflow-hidden min-w-0">
            <div className="px-4 sm:px-5 py-4 border-b border-brand-border flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-orange/12 text-brand-orange flex items-center justify-center shrink-0">
                <BarChart3 className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-brand-black">
                  By {data.granularity === 'month' ? 'month' : 'day'}
                </p>
                <p className="text-xs text-brand-grey mt-0.5">
                  {formatRangeDate(data.from)} – {formatRangeDate(data.to)}
                </p>
              </div>
              {loading && <Spinner className="!w-4 !h-4 mt-1" />}
            </div>

            {series.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-5 py-12">
                <div className="w-14 h-14 rounded-2xl bg-brand-warm text-brand-orange flex items-center justify-center mb-4">
                  {t.bookings === 0 ? <Sparkles className="w-6 h-6" /> : <Inbox className="w-6 h-6" />}
                </div>
                <p className="font-black text-brand-black">No activity in this range</p>
                <p className="text-sm text-brand-grey mt-1.5 max-w-xs">
                  Ride bookings that land in this window will show up here, day by day.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 sm:px-5 pt-4 pb-2">
                  <p className="text-[11px] font-bold text-brand-grey uppercase tracking-wider mb-2">
                    Bookings over time
                  </p>
                  <div className="flex items-end gap-px sm:gap-0.5 h-20">
                    {series.map((s) => {
                      const h = Math.max(6, Math.round((s.count / maxCount) * 100));
                      return (
                        <div
                          key={s.bucket}
                          title={`${formatBucket(s.bucket, data.granularity)} · ${s.count} booking${s.count === 1 ? '' : 's'} · ${fmtSAR(s.revenue)}`}
                          className="flex-1 min-w-0 rounded-t-sm bg-brand-orange/80 hover:bg-brand-orange transition-colors"
                          style={{ height: `${h}%` }}
                        />
                      );
                    })}
                  </div>
                </div>

                <ul className="divide-y divide-brand-border md:hidden">
                  {series.map((s) => (
                    <li key={s.bucket} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-bold text-brand-black text-sm truncate">
                          {formatBucket(s.bucket, data.granularity)}
                        </p>
                        <p className="font-black text-brand-orange tabular-nums text-sm shrink-0">
                          {fmtSAR(s.revenue)}
                        </p>
                      </div>
                      <p className="text-xs text-brand-grey mt-0.5">
                        {s.count} booking{s.count === 1 ? '' : 's'}
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-brand-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-orange"
                          style={{ width: `${Math.round((s.revenue / maxRevenue) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-surface text-brand-grey text-[11px] uppercase">
                      <tr>
                        <th className="text-left px-5 py-2.5 font-bold">Period</th>
                        <th className="text-right px-5 py-2.5 font-bold">Bookings</th>
                        <th className="text-right px-5 py-2.5 font-bold">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.map((s) => (
                        <tr key={s.bucket} className="border-t border-brand-border">
                          <td className="px-5 py-2.5 text-brand-dark font-medium">
                            {formatBucket(s.bucket, data.granularity)}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums">{s.count}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums font-bold">
                            {fmtSAR(s.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
