@extends('layouts.admin')

@section('title', 'Ecommerce')
@php $activeNav = 'shop'; @endphp

@section('content')
    <div class="space-y-5">
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5">
                <h3 class="text-base font-black text-brand-black tracking-tight">Stores</h3>
                <p class="text-xs text-brand-grey mt-0.5">Shop vertical merchants and catalogue size.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[720px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Store</th>
                            <th class="px-5 py-3">Products</th>
                            <th class="px-5 py-3">Status</th>
                            <th class="px-5 py-3">Accepting orders</th>
                            <th class="px-5 py-3 text-right">Credit used / limit</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($merchants as $m)
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3.5 font-bold text-brand-black">{{ $m->name }}</td>
                                <td class="px-5 py-3.5 tabular-nums text-brand-dark">{{ $m->products_count }}</td>
                                <td class="px-5 py-3.5">
                                    @if ($m->is_active && $m->status === 'active')
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
                                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Listed
                                        </span>
                                    @else
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Delisted</span>
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
                                    <span class="font-black text-brand-black">SAR {{ number_format((float) $m->credit_used, 2) }}</span>
                                    <span class="text-brand-grey">/ {{ $m->credit_limit !== null ? 'SAR ' . number_format((float) $m->credit_limit, 2) : '—' }}</span>
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="5" class="px-5 py-14 text-center text-brand-grey">No shop stores onboarded yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5">
                <h3 class="text-base font-black text-brand-black tracking-tight">Latest 50 shop orders</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[640px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Code</th>
                            <th class="px-5 py-3">Status</th>
                            <th class="px-5 py-3">Payment</th>
                            <th class="px-5 py-3 text-right">Total</th>
                            <th class="px-5 py-3">Placed</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($recentOrders as $o)
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3 font-bold text-brand-black">{{ $o->order_code ?? $o->id }}</td>
                                <td class="px-5 py-3 text-brand-dark">{{ ucfirst(str_replace('_', ' ', $o->status)) }}</td>
                                <td class="px-5 py-3 text-brand-grey">{{ ucfirst(str_replace('_', ' ', $o->payment_status)) }}</td>
                                <td class="px-5 py-3 text-right font-black text-brand-black tabular-nums">SAR {{ number_format((float) $o->total_amount, 2) }}</td>
                                <td class="px-5 py-3 text-brand-grey whitespace-nowrap">{{ \Illuminate\Support\Carbon::parse($o->created_at)->diffForHumans() }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="5" class="px-5 py-14 text-center text-brand-grey">No shop orders yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
@endsection
