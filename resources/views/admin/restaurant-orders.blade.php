@extends('layouts.admin')

@section('title', 'Restaurant Orders')
@php $activeNav = 'restaurant'; @endphp

@section('content')
    @php
        $orderStatusMeta = [
            'pending' => ['Pending', '#F59E0B'],
            'payment_under_review' => ['Under review', '#FB923C'],
            'accepted' => ['Accepted', '#3B82F6'],
            'preparing' => ['Preparing', '#6366F1'],
            'ready' => ['Ready', '#0EA5E9'],
            'picked_up' => ['Picked up', '#14B8A6'],
            'delivered' => ['Delivered', '#22C55E'],
            'cancelled' => ['Cancelled', '#EF4444'],
        ];
    @endphp

    <div class="space-y-5">
        {{-- Kitchens that have not started cooking --}}
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-5 sm:p-6">
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight">Not started cooking yet</h3>
                    <p class="text-sm text-brand-grey mt-0.5">Accepted orders with no <code class="text-brand-dark">preparing_at</code> timestamp — kitchens to nudge.</p>
                </div>
                @if ($notStarted->isNotEmpty())
                    <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-full shrink-0">
                        {{ $notStarted->count() }} waiting
                    </span>
                @endif
            </div>

            @if ($notStarted->isEmpty())
                <p class="text-sm text-brand-grey py-4 text-center">Every accepted order has a kitchen on it.</p>
            @else
                <div class="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
                    <table class="w-full text-sm min-w-[640px]">
                        <tbody class="divide-y divide-black/5">
                            @foreach ($notStarted as $o)
                                <tr>
                                    <td class="py-3 pr-4 font-bold text-brand-black">{{ $o->order_code }}</td>
                                    <td class="py-3 pr-4 text-brand-dark">{{ $o->merchant?->name ?? '—' }}</td>
                                    <td class="py-3 pr-4 text-brand-grey">{{ $o->user?->full_name ?? 'Guest' }}</td>
                                    <td class="py-3 pr-4 tabular-nums">{{ 'SAR ' . number_format((float) $o->total_amount, 2) }}</td>
                                    <td class="py-3 text-brand-grey">{{ $o->accepted_at?->diffForHumans() ?? '—' }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </div>

        {{-- Status summary --}}
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            @foreach ($statusCounts as $status => $count)
                @php [$label, $color] = $orderStatusMeta[$status] ?? [ucfirst($status), '#94A3B8']; @endphp
                <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm px-4 py-3">
                    <p class="text-[10px] font-bold uppercase tracking-wider" style="color: {{ $color }}">{{ $label }}</p>
                    <p class="text-xl font-black text-brand-black tabular-nums mt-1">{{ $count }}</p>
                </div>
            @endforeach
        </div>

        {{-- Recent orders --}}
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5">
                <h3 class="text-base font-black text-brand-black tracking-tight">Latest 100 orders</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[820px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Code</th>
                            <th class="px-5 py-3">Restaurant</th>
                            <th class="px-5 py-3">Customer</th>
                            <th class="px-5 py-3">Status</th>
                            <th class="px-5 py-3">Payment</th>
                            <th class="px-5 py-3 text-right">Total</th>
                            <th class="px-5 py-3">Placed</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($orders as $o)
                            @php [$label, $color] = $orderStatusMeta[$o->status] ?? [ucfirst(str_replace('_', ' ', $o->status)), '#94A3B8']; @endphp
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3 font-bold text-brand-black">{{ $o->order_code }}</td>
                                <td class="px-5 py-3 text-brand-dark">{{ $o->merchant?->name ?? '—' }}</td>
                                <td class="px-5 py-3 text-brand-grey">{{ $o->user?->full_name ?? 'Guest' }}</td>
                                <td class="px-5 py-3">
                                    <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                                          style="background-color: {{ $color }}15; color: {{ $color }}">
                                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: {{ $color }}"></span>
                                        {{ $label }}
                                    </span>
                                </td>
                                <td class="px-5 py-3 text-brand-grey">{{ ucfirst(str_replace('_', ' ', $o->payment_status)) }}</td>
                                <td class="px-5 py-3 text-right font-black text-brand-black tabular-nums">SAR {{ number_format((float) $o->total_amount, 2) }}</td>
                                <td class="px-5 py-3 text-brand-grey whitespace-nowrap">{{ $o->created_at?->diffForHumans() }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="px-5 py-14 text-center text-brand-grey">No restaurant orders yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
@endsection
