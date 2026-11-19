@extends('layouts.admin')

@section('title', 'Dashboard')

@section('content')
    @php
        $statusMeta = [
            'pending_payment' => ['Pending payment', '#F59E0B'],
            'payment_under_review' => ['Payment under review', '#FB923C'],
            'confirmed' => ['Confirmed', '#3B82F6'],
            'driver_assigned' => ['Driver assigned', '#6366F1'],
            'driver_on_the_way' => ['Driver on the way', '#0EA5E9'],
            'arrived' => ['Arrived', '#14B8A6'],
            'in_progress' => ['In progress', '#10B981'],
            'completed' => ['Completed', '#22C55E'],
            'cancelled' => ['Cancelled', '#EF4444'],
        ];
        $completionRate = $totals['bookings'] > 0 ? round(($totals['completed'] / $totals['bookings']) * 100) : 0;
        $attentionCount = $totals['needsReview'] + $drivers['pending'] + $totals['awaitingPayment'];
        $live = $totals['active'] > 0;
    @endphp

    <div class="space-y-5 sm:space-y-7">
        {{-- Greeting / hero panel --}}
        <div class="bg-white rounded-2xl sm:rounded-[1.25rem] border border-black/[0.05] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_40px_-20px_rgba(15,23,42,0.12)] overflow-hidden">
            <div class="relative p-5 sm:p-6 md:p-8">
                <div class="absolute inset-0 bg-gradient-to-br from-brand-black via-[#1a2235] to-[#111827]"></div>
                <div class="absolute top-0 right-0 w-56 sm:w-72 h-56 sm:h-72 bg-brand-orange/20 rounded-full blur-3xl translate-x-1/3 -translate-y-1/2"></div>

                <div class="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div class="min-w-0">
                        <p class="text-white/50 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.16em] mb-2">
                            {{ now()->format('l, F j') }}
                        </p>
                        <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">{{ $greeting }}</h2>
                        <p class="text-white/70 text-sm mt-2 max-w-lg">
                            {{ $totals['active'] === 0 ? 'No rides on the road right now.' : $totals['active'] . ' ride' . ($totals['active'] === 1 ? '' : 's') . ' currently on the road.' }}
                            {{ $attentionCount > 0 ? $attentionCount . ' item' . ($attentionCount === 1 ? '' : 's') . ' need your attention below.' : 'Everything that needs you is clear.' }}
                        </p>
                    </div>

                    <div class="grid grid-cols-3 gap-2 sm:gap-3 w-full lg:w-auto lg:min-w-[30rem]">
                        @foreach ([
                            ['Revenue', 'Verified fares', 'SAR ' . number_format($totals['revenue'], $totals['revenue'] == (int) $totals['revenue'] ? 0 : 2)],
                            ['Finished', 'Trips completed', $completionRate . '%'],
                            ['Drivers', 'Approved to drive', $drivers['approved']],
                        ] as [$label, $hint, $value])
                            <div class="rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur border border-white/10 px-2.5 py-3 sm:px-4 sm:py-4 min-w-0">
                                <div class="text-brand-orange mb-1.5">
                                    <span class="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/55 truncate">{{ $label }}</span>
                                </div>
                                <div class="text-sm sm:text-xl font-black text-white tabular-nums leading-tight break-words">{{ $value }}</div>
                                <div class="hidden sm:block text-[10px] text-white/40 mt-1">{{ $hint }}</div>
                            </div>
                        @endforeach
                    </div>
                </div>
            </div>
        </div>

        {{-- Needs your attention --}}
        <div>
            <div class="flex items-start gap-3 mb-4">
                <span class="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                </span>
                <div class="min-w-0">
                    <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight">Needs your attention</h3>
                    <p class="text-sm text-brand-grey mt-0.5">Work waiting on an admin — open a card to handle it.</p>
                </div>
            </div>

            @if ($attentionCount === 0)
                <div class="bg-white rounded-2xl border border-black/[0.05] p-4 sm:p-5 flex items-center gap-3">
                    <span class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                        </svg>
                    </span>
                    <div>
                        <p class="font-bold text-brand-black text-sm">You are all caught up</p>
                        <p class="text-xs text-brand-grey mt-0.5">No payment proofs, unpaid bookings, or driver applications waiting.</p>
                    </div>
                </div>
            @else
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    @foreach ([
                        ['Payment proofs', $totals['needsReview'], 'Passengers uploaded a receipt. Verify or reject it.', 'Review payments', '/admin/bookings', 'amber'],
                        ['New drivers', $drivers['pending'], 'Signups waiting before they can go online.', 'Review drivers', '/admin/drivers', 'blue'],
                        ['Unpaid bookings', $totals['awaitingPayment'], 'Passengers have not paid yet.', 'Open bookings', '/admin/bookings', 'orange'],
                    ] as [$title, $count, $desc, $action, $href, $tone])
                        @php
                            $urgent = $count > 0;
                            $wrap = $urgent ? match ($tone) {
                                'amber' => 'border-amber-200 bg-amber-50/80',
                                'blue' => 'border-sky-200 bg-sky-50/80',
                                default => 'border-orange-200 bg-orange-50/80',
                            } : 'border-black/[0.05] bg-white';
                            $icon = $urgent ? match ($tone) {
                                'amber' => 'bg-amber-100 text-amber-700',
                                'blue' => 'bg-sky-100 text-sky-700',
                                default => 'bg-orange-100 text-brand-orange',
                            } : 'bg-slate-100 text-slate-500';
                        @endphp
                        <a href="{{ $href }}" class="w-full text-left rounded-2xl border p-4 sm:p-5 transition-all block {{ $wrap }}">
                            <div class="flex items-start gap-3">
                                <span class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 {{ $icon }}">
                                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-3-3v6M5 21h14a2 2 0 002-2V7l-5-4H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                                    </svg>
                                </span>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center justify-between gap-2">
                                        <p class="font-bold text-brand-black text-sm">{{ $title }}</p>
                                        <span class="text-xl font-black tabular-nums {{ $urgent ? 'text-brand-black' : 'text-brand-grey' }}">{{ $count }}</span>
                                    </div>
                                    <p class="text-xs text-brand-grey mt-1 leading-snug">{{ $desc }}</p>
                                    <span class="inline-flex items-center gap-1 text-xs font-bold text-brand-orange mt-3">
                                        {{ $action }}
                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 17L17 7M7 7h10v10"/></svg>
                                    </span>
                                </div>
                            </div>
                        </a>
                    @endforeach
                </div>
            @endif
        </div>

        {{-- Rides at a glance --}}
        <div>
            <div class="flex items-start gap-3 mb-4">
                <span class="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-600">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6 0a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0 2 2 0 00-4 0z"/>
                    </svg>
                </span>
                <div class="min-w-0">
                    <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight">Rides at a glance</h3>
                    <p class="text-sm text-brand-grey mt-0.5">What is happening with pick &amp; drop right now.</p>
                </div>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                @foreach ([
                    ['On the road', $totals['active'], 'Driver assigned through trip in progress', 'bg-sky-500', 'bg-sky-50 text-sky-600', $live],
                    ['Booked today', $totals['today'], 'New ride requests since midnight', 'bg-brand-orange', 'bg-brand-orange/10 text-brand-orange', false],
                    ['Completed trips', $totals['completed'], 'Finished successfully', 'bg-emerald-500', 'bg-emerald-50 text-emerald-600', false],
                    ['Cancelled', $totals['cancelled'], 'Trips that did not go ahead', 'bg-rose-400', 'bg-rose-50 text-rose-600', false],
                ] as [$label, $value, $hint, $bar, $iconWrap, $withLiveBadge])
                    <div class="relative bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 sm:p-5 pl-5">
                        <span class="absolute left-0 top-3 bottom-3 w-1 rounded-full {{ $bar }}"></span>
                        <div class="flex items-center justify-between gap-2">
                            <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 {{ $iconWrap }}">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                                </svg>
                            </span>
                            @if ($withLiveBadge && $live)
                                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 admin-live-dot"></span>
                                    Live
                                </span>
                            @endif
                        </div>
                        <p class="text-sm font-bold text-brand-dark mt-3 leading-snug">{{ $label }}</p>
                        <p class="text-2xl sm:text-[1.7rem] font-black text-brand-black tracking-tight mt-0.5 tabular-nums">{{ $value }}</p>
                        <p class="text-xs text-brand-grey mt-1 leading-snug">{{ $hint }}</p>
                    </div>
                @endforeach
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-5 gap-3 sm:gap-4">
            {{-- Status breakdown --}}
            <div class="xl:col-span-3 bg-white rounded-2xl border border-black/[0.05] shadow-sm p-5 sm:p-6 md:p-7">
                <div class="flex items-start gap-3 mb-4">
                    <span class="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-brand-orange/10 text-brand-orange">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                        </svg>
                    </span>
                    <div class="min-w-0">
                        <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight">Where bookings stand</h3>
                        <p class="text-sm text-brand-grey mt-0.5">Every ride, grouped by stage — from unpaid to completed.</p>
                    </div>
                </div>

                @php $segments = $byStatus->filter(fn ($n, $s) => isset($statusMeta[$s]) && $n > 0)->sortDesc(); @endphp
                @if ($segments->isEmpty())
                    <div class="py-12 text-center text-sm text-brand-grey">No bookings in the system yet.</div>
                @else
                    @php $segmentTotal = $segments->sum(); @endphp
                    <div class="space-y-2.5">
                        @foreach ($segments as $status => $n)
                            @php
                                [$label, $color] = $statusMeta[$status];
                                $pct = $segmentTotal > 0 ? round(($n / $segmentTotal) * 100) : 0;
                            @endphp
                            <div class="flex items-center gap-3">
                                <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-black"
                                      style="background-color: {{ $color }}18; color: {{ $color }}">
                                    {{ $pct }}%
                                </span>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center justify-between gap-2 text-sm">
                                        <span class="font-semibold text-brand-dark truncate">{{ $label }}</span>
                                        <span class="font-black text-brand-black shrink-0 tabular-nums">{{ $n }}</span>
                                    </div>
                                    <div class="mt-1.5 h-1.5 rounded-full bg-brand-surface overflow-hidden">
                                        <div class="h-full rounded-full transition-all duration-500"
                                             style="width: {{ $pct }}%; background-color: {{ $color }}"></div>
                                    </div>
                                </div>
                            </div>
                        @endforeach
                    </div>
                @endif
            </div>

            {{-- Jump links + recent bookings --}}
            <div class="xl:col-span-2 flex flex-col gap-3 sm:gap-4">
                <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-5 sm:p-6 md:p-7 flex-1">
                    <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight mb-3">Recent bookings</h3>

                    @if ($recentBookings->isEmpty())
                        <p class="text-sm text-brand-grey py-6 text-center">No bookings yet.</p>
                    @else
                        <div class="divide-y divide-black/5 -mx-2">
                            @foreach ($recentBookings as $b)
                                @php
                                    [$label, $color] = $statusMeta[$b->status] ?? [ucfirst(str_replace('_', ' ', $b->status)), '#94A3B8'];
                                @endphp
                                <div class="flex items-center gap-3 px-2 py-2.5">
                                    <span class="w-2 h-2 rounded-full shrink-0" style="background-color: {{ $color }}"></span>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-bold text-brand-black truncate">{{ $b->booking_code }}</p>
                                        <p class="text-xs text-brand-grey truncate">
                                            {{ $b->user?->full_name ?? 'Guest' }} · {{ $b->created_at->diffForHumans() }}
                                        </p>
                                    </div>
                                    <div class="text-right shrink-0">
                                        <p class="text-sm font-black text-brand-black tabular-nums">SAR {{ number_format((float) $b->total_amount, 2) }}</p>
                                        <p class="text-[11px] font-semibold" style="color: {{ $color }}">{{ $label }}</p>
                                    </div>
                                </div>
                            @endforeach
                        </div>

                        <a href="/admin/bookings" class="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-orange hover:underline">
                            View all bookings
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 17L17 7M7 7h10v10"/></svg>
                        </a>
                    @endif
                </div>

                <div class="rounded-2xl bg-gradient-to-br from-brand-black to-[#1a2235] p-5 text-white">
                    <div class="flex items-center gap-2 text-brand-orange mb-3">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                        </svg>
                        <span class="text-xs font-bold uppercase tracking-wider">Driver fleet</span>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <div class="text-2xl font-black tabular-nums">{{ $drivers['approved'] }}</div>
                            <div class="text-xs text-white/55 mt-1">Can take rides</div>
                        </div>
                        <div>
                            <div class="text-2xl font-black tabular-nums">{{ $drivers['pending'] }}</div>
                            <div class="text-xs text-white/55 mt-1">Waiting on docs</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
