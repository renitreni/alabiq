@extends('layouts.admin')

@section('title', 'Reports')
@php $activeNav = 'reports'; @endphp

@section('content')
    <div class="space-y-5">
        <form method="GET" action="/admin/reports"
              class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 flex flex-wrap items-end gap-3">
            <label class="block">
                <span class="text-xs font-bold text-brand-dark">From</span>
                <input type="date" name="from" value="{{ $from }}"
                       class="mt-1 block bg-white border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-orange focus:outline-none">
            </label>
            <label class="block">
                <span class="text-xs font-bold text-brand-dark">To</span>
                <input type="date" name="to" value="{{ $to }}"
                       class="mt-1 block bg-white border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-orange focus:outline-none">
            </label>
            <button type="submit"
                    class="bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm shadow-brand-orange/25">
                Run report
            </button>
            <button type="submit" name="export" value="1"
                    class="text-sm font-bold text-brand-dark bg-white border border-brand-border hover:border-brand-orange/30 hover:text-brand-orange px-5 py-2.5 rounded-xl transition-colors">
                Export CSV
            </button>
        </form>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            @foreach ([['Bookings', $totals['bookings'], 'bg-brand-orange'], ['Food orders', $totals['orders'], 'bg-sky-500'], ['Verified revenue', 'SAR ' . number_format($totals['revenue'], 2), 'bg-emerald-500']] as [$label, $value, $bar])
                <div class="relative bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 sm:p-5 pl-5">
                    <span class="absolute left-0 top-3 bottom-3 w-1 rounded-full {{ $bar }}"></span>
                    <p class="text-sm font-bold text-brand-dark">{{ $label }}</p>
                    <p class="text-2xl font-black text-brand-black tracking-tight mt-0.5 tabular-nums">{{ $value }}</p>
                </div>
            @endforeach
        </div>

        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[560px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Date</th>
                            <th class="px-5 py-3 text-right">Bookings</th>
                            <th class="px-5 py-3 text-right">Food orders</th>
                            <th class="px-5 py-3 text-right">Verified revenue</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($rows as $row)
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3 font-bold text-brand-black">{{ $row['day'] }}</td>
                                <td class="px-5 py-3 text-right tabular-nums">{{ $row['bookings'] }}</td>
                                <td class="px-5 py-3 text-right tabular-nums">{{ $row['orders'] }}</td>
                                <td class="px-5 py-3 text-right font-black text-brand-black tabular-nums">SAR {{ number_format($row['revenue'], 2) }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="4" class="px-5 py-14 text-center text-brand-grey">No activity in this date range.</td>
                            </tr>
                        @endforelse
                    </tbody>
                    @if ($rows->isNotEmpty())
                        <tfoot>
                            <tr class="border-t border-black/10 bg-brand-muted/60 font-black text-brand-black">
                                <td class="px-5 py-3">Total</td>
                                <td class="px-5 py-3 text-right tabular-nums">{{ $totals['bookings'] }}</td>
                                <td class="px-5 py-3 text-right tabular-nums">{{ $totals['orders'] }}</td>
                                <td class="px-5 py-3 text-right tabular-nums">SAR {{ number_format($totals['revenue'], 2) }}</td>
                            </tr>
                        </tfoot>
                    @endif
                </table>
            </div>
        </div>
    </div>
@endsection
