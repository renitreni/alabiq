// ---------------------------------------------------------------------
// Admin dashboard — sectioned overview so operators can scan money,
// work that needs them, live rides, and jump into the right tab.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  BadgeCheck,
  UserCheck,
  Navigation,
  CalendarPlus,
  Hourglass,
  FileCheck,
  CircleCheck,
  Ban,
  UserPlus,
  ArrowUpRight,
  Bell,
  Route,
  LayoutGrid,
  ClipboardList,
  Users,
  ChefHat,
  UtensilsCrossed,
  ShoppingBag,
  BarChart3,
  Shield,
  WalletCards,
  Search,
  MapPin,
  Car,
  CircleX,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBroadcast } from '../lib/useBroadcast';
import { realtimeEnabled } from '../lib/gatewayClient';
import { statusMeta } from '../lib/constants';
import { Spinner } from '../components/ui';

const STATUS_COLORS = {
  pending_payment: '#F59E0B',
  payment_under_review: '#FB923C',
  confirmed: '#3B82F6',
  driver_assigned: '#6366F1',
  driver_on_the_way: '#0EA5E9',
  arrived: '#14B8A6',
  in_progress: '#10B981',
  completed: '#22C55E',
  cancelled: '#EF4444',
};

const STATUS_ICONS = {
  pending_payment: WalletCards,
  payment_under_review: FileCheck,
  confirmed: Search,
  driver_assigned: UserCheck,
  driver_on_the_way: Navigation,
  arrived: MapPin,
  in_progress: Car,
  completed: CircleCheck,
  cancelled: CircleX,
};

function Panel({ className = '', children }) {
  return (
    <div
      className={`bg-white rounded-2xl sm:rounded-[1.25rem] border border-black/[0.05] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_40px_-20px_rgba(15,23,42,0.12)] min-w-0 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHead({ icon: Icon, title, subtitle, tone = 'orange' }) {
  const tones = {
    orange: 'bg-brand-orange/12 text-brand-orange',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-black text-brand-black tracking-tight">{title}</h3>
        {subtitle && <p className="text-sm text-brand-grey mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function DonutChart({ segments, size = 156 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <div
        className="relative flex items-center justify-center rounded-full bg-brand-surface"
        style={{ width: size, height: size }}
      >
        <span className="text-xs font-semibold text-brand-grey">No rides yet</span>
      </div>
    );
  }

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const dash = pct * circumference;
    const arc = { ...seg, dash, gap: circumference - dash, offset: -offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EEF2F7"
          strokeWidth={stroke}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={arc.offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <div className="text-2xl sm:text-3xl font-black text-brand-black leading-none tabular-nums">{total}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold text-brand-grey mt-1">
          All bookings
        </div>
      </div>
    </div>
  );
}

function SnapshotCard({ label, value, hint, icon: Icon, accent, onClick, badge }) {
  const accents = {
    orange: { bar: 'bg-brand-orange', icon: 'bg-brand-orange/12 text-brand-orange' },
    green: { bar: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600' },
    blue: { bar: 'bg-sky-500', icon: 'bg-sky-50 text-sky-600' },
    amber: { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600' },
    red: { bar: 'bg-rose-400', icon: 'bg-rose-50 text-rose-600' },
    slate: { bar: 'bg-slate-400', icon: 'bg-slate-100 text-slate-600' },
  };
  const a = accents[accent] || accents.slate;

  const inner = (
    <>
      <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${a.bar}`} />
      <div className="flex items-center justify-between gap-2">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.icon}`}>
          <Icon className="w-5 h-5" />
        </span>
        {badge}
        {onClick && !badge && (
          <ArrowUpRight className="w-4 h-4 text-brand-grey/40 group-hover:text-brand-orange transition-colors" />
        )}
      </div>
      <p className="text-sm font-bold text-brand-dark mt-3 leading-snug">{label}</p>
      <p className="text-2xl sm:text-[1.7rem] font-black text-brand-black tracking-tight mt-0.5 tabular-nums">
        {value}
      </p>
      <p className="text-xs text-brand-grey mt-1 leading-snug">{hint}</p>
      {onClick && (
        <p className="mt-3 text-xs font-bold text-brand-orange inline-flex items-center gap-1">
          Open <ArrowUpRight className="w-3.5 h-3.5" />
        </p>
      )}
    </>
  );

  const cls = 'relative text-left w-full h-full p-4 sm:p-5 pl-5';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`group cursor-pointer ${cls}`}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function AttentionCard({ icon: Icon, title, count, desc, action, onClick, tone }) {
  const urgent = count > 0;
  const tones = {
    amber: {
      wrap: urgent ? 'border-amber-200 bg-amber-50/80' : 'border-black/[0.05] bg-white',
      icon: urgent ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
    },
    blue: {
      wrap: urgent ? 'border-sky-200 bg-sky-50/80' : 'border-black/[0.05] bg-white',
      icon: urgent ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500',
    },
    orange: {
      wrap: urgent ? 'border-orange-200 bg-orange-50/80' : 'border-black/[0.05] bg-white',
      icon: urgent ? 'bg-orange-100 text-brand-orange' : 'bg-slate-100 text-slate-500',
    },
  };
  const t = tones[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 sm:p-5 transition-all cursor-pointer group ${t.wrap}`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${t.icon}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-brand-black text-sm">{title}</p>
            <span className={`text-xl font-black tabular-nums ${urgent ? 'text-brand-black' : 'text-brand-grey'}`}>
              {count}
            </span>
          </div>
          <p className="text-xs text-brand-grey mt-1 leading-snug">{desc}</p>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-orange mt-3">
            {action} <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

function JumpLink({ icon: Icon, title, hint, onClick, accent }) {
  const accents = {
    orange: 'bg-brand-orange/12 text-brand-orange',
    blue: 'bg-sky-50 text-sky-600',
    green: 'bg-emerald-50 text-emerald-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-muted border border-transparent hover:border-black/[0.04] cursor-pointer transition-colors text-left group"
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accents[accent]}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-brand-black">{title}</span>
        <span className="block text-xs text-brand-grey truncate">{hint}</span>
      </span>
      <ArrowUpRight className="w-4 h-4 text-brand-grey/40 group-hover:text-brand-orange transition-colors shrink-0" />
    </button>
  );
}

function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setStats(await api.adminStats());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useBroadcast('admin-bookings', { changed: load }, realtimeEnabled);

  const segments = useMemo(() => {
    if (!stats?.bookingsByStatus) return [];
    return Object.entries(stats.bookingsByStatus)
      .sort((a, b) => b[1] - a[1])
      .map(([status, value]) => ({
        key: status,
        value,
        color: STATUS_COLORS[status] || '#94A3B8',
        label: statusMeta(status).label,
        Icon: STATUS_ICONS[status] || Route,
      }));
  }, [stats]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-3">
        <Spinner className="!w-9 !h-9" />
        <p className="text-sm font-medium text-brand-grey">Loading your dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Panel className="p-5 text-red-700 bg-red-50 border-red-100 text-sm font-medium">{error}</Panel>
    );
  }

  if (!stats) return null;

  const t = stats.totals;
  const d = stats.drivers;
  const completionRate = t.bookings > 0 ? Math.round((t.completed / t.bookings) * 100) : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const attentionCount = t.needsReview + d.pending + t.awaitingPayment;
  const live = t.active > 0;
  // Only the /admin/ferdz demo sends revenueTrend; the live stats endpoint
  // has no such key, so this row simply does not render in production.
  const trend = Array.isArray(stats.revenueTrend) ? stats.revenueTrend : [];
  const trendPeak = trend.reduce((max, m) => Math.max(max, m.revenue), 0) || 1;

  return (
    <div className="space-y-5 sm:space-y-7">
      <Panel className="overflow-hidden">
        <div className="relative p-5 sm:p-6 md:p-8">
          <div className="absolute inset-0 bg-linear-to-br from-brand-black via-[#1a2235] to-[#111827]" />
          <div className="absolute top-0 right-0 w-56 sm:w-72 h-56 sm:h-72 bg-brand-orange/20 rounded-full blur-3xl translate-x-1/3 -translate-y-1/2" />
          <div className="absolute bottom-0 left-1/3 w-40 sm:w-56 h-40 sm:h-56 bg-sky-500/10 rounded-full blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-white/50 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em] mb-2">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{greeting}</h2>
              <p className="text-white/70 text-sm mt-2 max-w-lg">
                {t.active === 0
                  ? 'No rides on the road right now.'
                  : `${t.active} ride${t.active === 1 ? '' : 's'} currently on the road.`}
                {attentionCount > 0
                  ? ` ${attentionCount} item${attentionCount === 1 ? '' : 's'} need your attention below.`
                  : ' Everything that needs you is clear.'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full lg:w-auto lg:min-w-[30rem]">
              {[
                { icon: Wallet, label: 'Revenue', hint: 'Verified fares', value: `SAR ${money(t.revenue)}` },
                { icon: BadgeCheck, label: 'Finished', hint: 'Trips completed', value: `${completionRate}%` },
                { icon: UserCheck, label: 'Drivers', hint: 'Approved to drive', value: d.approved },
              ].map(({ icon: Icon, label, hint, value }) => (
                <div
                  key={label}
                  className="rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur border border-white/10 px-2.5 py-3 sm:px-4 sm:py-4 min-w-0"
                >
                  <div className="flex items-center gap-1.5 text-brand-orange mb-1.5">
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/55 truncate">
                      {label}
                    </span>
                  </div>
                  <div className="text-sm sm:text-xl font-black text-white tabular-nums leading-tight break-words">
                    {value}
                  </div>
                  <div className="hidden sm:block text-[10px] text-white/40 mt-1">{hint}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {trend.length > 0 && (
        <Panel className="p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <div>
              <p className="font-bold text-brand-black text-sm">Revenue by month</p>
              <p className="text-xs text-brand-grey mt-0.5">Verified fares, last {trend.length} months</p>
            </div>
            <p className="text-lg font-black text-brand-orange tabular-nums shrink-0">
              SAR {money(trend[trend.length - 1].revenue)}
            </p>
          </div>
          <div className="flex items-end gap-2 h-24">
            {trend.map((m) => (
              <div key={m.bucket} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-brand-grey tabular-nums">{money(m.revenue)}</span>
                <div
                  className="w-full rounded-t-sm bg-brand-orange/80"
                  style={{ height: `${Math.max(6, (m.revenue / trendPeak) * 100)}%` }}
                />
                <span className="text-[10px] font-medium text-brand-grey truncate w-full text-center">{m.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div>
        <SectionHead
          icon={Bell}
          title="Needs your attention"
          subtitle="Work waiting on an admin — tap a card to handle it."
          tone="amber"
        />
        {attentionCount === 0 ? (
          <Panel className="p-4 sm:p-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <p className="font-bold text-brand-black text-sm">You are all caught up</p>
              <p className="text-xs text-brand-grey mt-0.5">
                No payment proofs, unpaid bookings, or driver applications waiting.
              </p>
            </div>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AttentionCard
              icon={FileCheck}
              title="Payment proofs"
              count={t.needsReview}
              desc="Passengers uploaded a receipt. Verify or reject it."
              action="Review payments"
              tone="amber"
              onClick={() => onNavigate?.('bookings')}
            />
            <AttentionCard
              icon={UserPlus}
              title="New drivers"
              count={d.pending}
              desc="Signups waiting before they can go online."
              action="Review drivers"
              tone="blue"
              onClick={() => onNavigate?.('drivers')}
            />
            <AttentionCard
              icon={Hourglass}
              title="Unpaid bookings"
              count={t.awaitingPayment}
              desc="Passengers have not paid yet."
              action="Open bookings"
              tone="orange"
              onClick={() => onNavigate?.('bookings')}
            />
          </div>
        )}
      </div>

      <div>
        <SectionHead
          icon={Car}
          title="Rides at a glance"
          subtitle="What is happening with pick & drop right now."
          tone="slate"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Panel>
            <SnapshotCard
              label="On the road"
              value={t.active}
              hint="Driver assigned through trip in progress"
              icon={Navigation}
              accent="blue"
              badge={live ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 admin-live-dot" />
                  Live
                </span>
              ) : null}
            />
          </Panel>
          <Panel>
            <SnapshotCard
              label="Booked today"
              value={t.today}
              hint="New ride requests since midnight"
              icon={CalendarPlus}
              accent="orange"
            />
          </Panel>
          <Panel>
            <SnapshotCard
              label="Completed trips"
              value={t.completed}
              hint="Finished successfully"
              icon={CircleCheck}
              accent="green"
            />
          </Panel>
          <Panel>
            <SnapshotCard
              label="Cancelled"
              value={t.cancelled}
              hint="Trips that did not go ahead"
              icon={Ban}
              accent="red"
            />
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 sm:gap-4">
        <Panel className="xl:col-span-3 p-5 sm:p-6 md:p-7">
          <SectionHead
            icon={Route}
            title="Where bookings stand"
            subtitle="Every ride, grouped by stage — from unpaid to completed."
          />

          {segments.length === 0 ? (
            <div className="py-12 text-center text-sm text-brand-grey">No bookings in the system yet.</div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <DonutChart segments={segments} />
              <div className="flex-1 w-full space-y-2.5 min-w-0">
                {segments.map((seg) => {
                  const total = segments.reduce((s, x) => s + x.value, 0);
                  const pct = Math.round((seg.value / total) * 100);
                  const Icon = seg.Icon;
                  return (
                    <div key={seg.key} className="flex items-center gap-3">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${seg.color}18`, color: seg.color }}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-semibold text-brand-dark truncate">{seg.label}</span>
                          <span className="font-black text-brand-black shrink-0 tabular-nums">{seg.value}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-brand-surface overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: seg.color }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-brand-grey w-8 text-right shrink-0 tabular-nums">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-2 p-5 sm:p-6 md:p-7 flex flex-col">
          <SectionHead
            icon={LayoutGrid}
            title="Jump to a section"
            subtitle="Open the tab you need without hunting the sidebar."
          />

          <div className="space-y-0.5">
            <JumpLink
              icon={ClipboardList}
              title="Bookings"
              hint={`${t.awaitingPayment + t.needsReview} need payment action`}
              accent="orange"
              onClick={() => onNavigate?.('bookings')}
            />
            <JumpLink
              icon={Users}
              title="Drivers"
              hint={`${d.approved} approved · ${d.pending} waiting`}
              accent="blue"
              onClick={() => onNavigate?.('drivers')}
            />
            <JumpLink
              icon={ChefHat}
              title="Restaurant orders"
              hint="Kitchens that have not started cooking"
              accent="amber"
              onClick={() => onNavigate?.('restaurant')}
            />
            <JumpLink
              icon={UtensilsCrossed}
              title="Food delivery"
              hint="Merchants, menus, and order payments"
              accent="green"
              onClick={() => onNavigate?.('food')}
            />
            <JumpLink
              icon={ShoppingBag}
              title="Shop"
              hint="Stores, catalogue, and settlement"
              accent="violet"
              onClick={() => onNavigate?.('shop')}
            />
            <JumpLink
              icon={BarChart3}
              title="Reports"
              hint="Bookings and revenue over time"
              accent="slate"
              onClick={() => onNavigate?.('reports')}
            />
          </div>

          <div className="rounded-2xl bg-linear-to-br from-brand-black to-[#1a2235] p-5 text-white mt-4">
            <div className="flex items-center gap-2 text-brand-orange mb-3">
              <Shield className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Driver fleet</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-2xl font-black tabular-nums">{d.approved}</div>
                <div className="text-xs text-white/55 mt-1">Can take rides</div>
              </div>
              <div>
                <div className="text-2xl font-black tabular-nums">{d.pending}</div>
                <div className="text-xs text-white/55 mt-1">Waiting on docs</div>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
