@extends('layouts.admin')

@section('title', 'Bookings')
@php $activeNav = 'bookings'; @endphp

@section('content')
    @php
        $statusMeta = [
            'pending_payment' => ['Pending payment', '#F59E0B'],
            'payment_under_review' => ['Under review', '#FB923C'],
            'confirmed' => ['Confirmed', '#3B82F6'],
            'driver_assigned' => ['Driver assigned', '#6366F1'],
            'driver_on_the_way' => ['On the way', '#0EA5E9'],
            'arrived' => ['Arrived', '#14B8A6'],
            'in_progress' => ['In progress', '#10B981'],
            'completed' => ['Completed', '#22C55E'],
            'cancelled' => ['Cancelled', '#EF4444'],
        ];
    @endphp

    <div class="space-y-5">
        {{-- Payment proof queue (read-only in the Blade portal — verification
             actions live in the API where the payments lib parity lives) --}}
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-5 sm:p-6">
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight">Payment proofs waiting for review</h3>
                    <p class="text-sm text-brand-grey mt-0.5">
                        {{ $pendingProofs->count() ? 'Uploads that still need a verify or reject decision.' : 'Nothing waiting — every uploaded receipt has been decided.' }}
                    </p>
                </div>
                @if ($pendingProofs->isNotEmpty())
                    <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-full shrink-0">
                        {{ $pendingProofs->count() }} pending
                    </span>
                @endif
            </div>

            @if ($pendingProofs->isNotEmpty())
                <div class="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
                    <table class="w-full text-sm min-w-[640px]">
                        <thead>
                            <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey border-b border-black/5">
                                <th class="py-2.5 pr-4">Booking</th>
                                <th class="py-2.5 pr-4">File</th>
                                <th class="py-2.5 pr-4">Reference</th>
                                <th class="py-2.5 pr-4">Amount</th>
                                <th class="py-2.5">Uploaded</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-black/5">
                            @foreach ($pendingProofs as $proof)
                                <tr>
                                    <td class="py-3 pr-4 font-bold text-brand-black">{{ $proof->booking_code ?? '—' }}</td>
                                    <td class="py-3 pr-4 text-brand-dark">{{ $proof->file_name }}</td>
                                    <td class="py-3 pr-4 text-brand-grey">{{ $proof->reference ?? '—' }}</td>
                                    <td class="py-3 pr-4 tabular-nums">{{ $proof->total_amount !== null ? 'SAR ' . number_format((float) $proof->total_amount, 2) : '—' }}</td>
                                    <td class="py-3 text-brand-grey">{{ \Illuminate\Support\Carbon::parse($proof->created_at)->diffForHumans() }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
                <p class="text-xs text-brand-grey mt-3">
                    Verify and reject actions are available through the admin API
                    (<code class="text-brand-dark">POST /api/admin/bookings/:code/verify-payment</code>) until the
                    payments service is ported to Laravel.
                </p>
            @endif
        </div>

        {{-- Filters --}}
        <form method="GET" action="/admin/bookings" class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 flex flex-wrap items-end gap-3">
            <label class="block">
                <span class="text-xs font-bold text-brand-dark">Status</span>
                <select name="status"
                        class="mt-1 block bg-white border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-orange focus:outline-none">
                    <option value="">All statuses</option>
                    @foreach ($statuses as $s)
                        <option value="{{ $s }}" @selected(request('status') === $s)>{{ $statusMeta[$s][0] ?? ucfirst(str_replace('_', ' ', $s)) }}</option>
                    @endforeach
                </select>
            </label>
            <label class="block">
                <span class="text-xs font-bold text-brand-dark">Payment</span>
                <select name="payment_status"
                        class="mt-1 block bg-white border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-orange focus:outline-none">
                    <option value="">All</option>
                    @foreach (['pending', 'under_review', 'verified', 'rejected', 'refunded'] as $p)
                        <option value="{{ $p }}" @selected(request('payment_status') === $p)>{{ ucfirst(str_replace('_', ' ', $p)) }}</option>
                    @endforeach
                </select>
            </label>
            <label class="block flex-1 min-w-40">
                <span class="text-xs font-bold text-brand-dark">Booking code</span>
                <input type="text" name="q" value="{{ request('q') }}" placeholder="ALB-…"
                       class="mt-1 w-full bg-white border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-orange focus:outline-none">
            </label>
            <button type="submit"
                    class="bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm shadow-brand-orange/25">
                Filter
            </button>
            <a href="/admin/bookings" class="text-sm font-bold text-brand-grey hover:text-brand-orange px-3 py-2.5">Reset</a>
        </form>

        {{-- Bookings table --}}
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[820px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3.5">Code</th>
                            <th class="px-5 py-3.5">Passenger</th>
                            <th class="px-5 py-3.5">Route</th>
                            <th class="px-5 py-3.5">Status</th>
                            <th class="px-5 py-3.5">Payment</th>
                            <th class="px-5 py-3.5 text-right">Total</th>
                            <th class="px-5 py-3.5">Created</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($bookings as $b)
                            @php
                                [$label, $color] = $statusMeta[$b->status] ?? [ucfirst(str_replace('_', ' ', $b->status)), '#94A3B8'];
                            @endphp
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3.5 font-bold text-brand-black">{{ $b->booking_code }}</td>
                                <td class="px-5 py-3.5 text-brand-dark">{{ $b->user?->full_name ?? 'Guest' }}</td>
                                <td class="px-5 py-3.5 text-brand-grey max-w-56 truncate">
                                    {{ $b->pickup_address ? \Illuminate\Support\Str::limit($b->pickup_address, 24) . ' → ' . \Illuminate\Support\Str::limit($b->dropoff_address ?? '', 24) : '—' }}
                                </td>
                                <td class="px-5 py-3.5">
                                    <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                                          style="background-color: {{ $color }}15; color: {{ $color }}">
                                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: {{ $color }}"></span>
                                        {{ $label }}
                                    </span>
                                </td>
                                <td class="px-5 py-3.5 text-brand-grey">{{ ucfirst(str_replace('_', ' ', $b->payment_status)) }}</td>
                                <td class="px-5 py-3.5 text-right font-black text-brand-black tabular-nums">
                                    {{ $b->total_amount !== null ? 'SAR ' . number_format((float) $b->total_amount, 2) : '—' }}
                                </td>
                                <td class="px-5 py-3.5 text-brand-grey whitespace-nowrap">{{ $b->created_at->diffForHumans() }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="px-5 py-14 text-center text-brand-grey">No bookings match these filters.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            @if ($bookings->hasPages())
                <div class="px-5 py-4 border-t border-black/5">
                    {{ $bookings->links() }}
                </div>
            @endif
        </div>
    </div>
@endsection
