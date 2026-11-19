@extends('layouts.admin')

@section('title', 'Food Delivery')
@php $activeNav = 'food'; @endphp

@section('content')
    <div class="space-y-5">
        {{-- Payment summary --}}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            @forelse ($paymentSummary as $row)
                <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4">
                    <p class="text-xs font-bold uppercase tracking-wider text-brand-grey">{{ ucfirst(str_replace('_', ' ', $row->payment_status)) }}</p>
                    <p class="text-2xl font-black text-brand-black tabular-nums mt-1">{{ $row->n }}</p>
                    <p class="text-xs text-brand-grey mt-0.5 tabular-nums">SAR {{ number_format((float) $row->total, 2) }}</p>
                </div>
            @empty
                <div class="col-span-full bg-white rounded-2xl border border-black/[0.05] p-8 text-center text-sm text-brand-grey">
                    No food orders in the system yet.
                </div>
            @endforelse
        </div>

        {{-- Merchants --}}
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5 flex items-center justify-between gap-3">
                <div>
                    <h3 class="text-base font-black text-brand-black tracking-tight">Merchants</h3>
                    <p class="text-xs text-brand-grey mt-0.5">Credit limits, catalogue size, and listing state.</p>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[820px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Merchant</th>
                            <th class="px-5 py-3">Cuisine</th>
                            <th class="px-5 py-3">Menu items</th>
                            <th class="px-5 py-3">Status</th>
                            <th class="px-5 py-3">Accepting orders</th>
                            <th class="px-5 py-3 text-right">Credit used / limit</th>
                            <th class="px-5 py-3">App link</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($merchants as $m)
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3.5">
                                    <div class="flex items-center gap-3">
                                        @if ($m->logo_url)
                                            <img src="{{ $m->logo_url }}" alt="" class="w-9 h-9 rounded-xl object-contain border border-black/5 p-1">
                                        @else
                                            <span class="w-9 h-9 rounded-xl bg-brand-warm text-brand-orange flex items-center justify-center font-black text-xs">
                                                {{ strtoupper(substr($m->name, 0, 1)) }}
                                            </span>
                                        @endif
                                        <div class="min-w-0">
                                            <p class="font-bold text-brand-black truncate">{{ $m->name }}</p>
                                            @if ($m->is_featured)
                                                <span class="text-[10px] font-black uppercase tracking-wider text-brand-orange">Featured</span>
                                            @endif
                                        </div>
                                    </div>
                                </td>
                                <td class="px-5 py-3.5 text-brand-dark">{{ $m->cuisine_type ?? '—' }}</td>
                                <td class="px-5 py-3.5 tabular-nums text-brand-dark">{{ $m->menu_items_count }}</td>
                                <td class="px-5 py-3.5">
                                    @if ($m->is_active && $m->status === 'active')
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
                                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Listed
                                        </span>
                                    @else
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                                            <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Delisted
                                        </span>
                                    @endif
                                </td>
                                <td class="px-5 py-3.5">
                                    @if ($m->accepting_orders)
                                        <span class="text-xs font-bold text-emerald-600">Yes</span>
                                    @else
                                        <span class="text-xs font-bold text-brand-grey">Paused</span>
                                    @endif
                                </td>
                                <td class="px-5 py-3.5 text-right tabular-nums">
                                    <span class="font-black {{ $m->credit_limit > 0 && $m->credit_used / max($m->credit_limit, 1) > 0.8 ? 'text-rose-600' : 'text-brand-black' }}">
                                        SAR {{ number_format((float) $m->credit_used, 2) }}
                                    </span>
                                    <span class="text-brand-grey">/ {{ $m->credit_limit !== null ? 'SAR ' . number_format((float) $m->credit_limit, 2) : '—' }}</span>
                                </td>
                                <td class="px-5 py-3.5">
                                    @if ($m->public_hash)
                                        <a href="/app/{{ $m->public_hash }}" target="_blank"
                                           class="text-xs font-bold text-brand-orange hover:underline">/app/{{ $m->public_hash }}</a>
                                    @else
                                        <span class="text-xs text-brand-grey">—</span>
                                    @endif
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="px-5 py-14 text-center text-brand-grey">No food merchants onboarded yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
@endsection
