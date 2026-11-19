@extends('layouts.admin')

@section('title', 'Integrations')
@php $activeNav = 'integrations'; @endphp

@section('content')
    <div class="space-y-5">
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-5 sm:p-6 flex items-start gap-3">
            <span class="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 {{ $partnerApiEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500' }}">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
            </span>
            <div>
                <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight">Partner API</h3>
                <p class="text-sm text-brand-grey mt-0.5">
                    {{ $partnerApiEnabled ? 'Enabled — partner credentials below can authenticate against the API.' : 'Disabled (PARTNER_API_ENABLED is off). Credentials are stored but cannot authenticate.' }}
                </p>
            </div>
        </div>

        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5">
                <h3 class="text-base font-black text-brand-black tracking-tight">Credentials</h3>
                <p class="text-xs text-brand-grey mt-0.5">Only the SHA-256 hash is stored — keys cannot be recovered here.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[640px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Partner</th>
                            <th class="px-5 py-3">Status</th>
                            <th class="px-5 py-3">Expires</th>
                            <th class="px-5 py-3">Created</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($credentials as $c)
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3.5 font-bold text-brand-black">{{ $c->name }}</td>
                                <td class="px-5 py-3.5">
                                    @if ($c->revoked_at)
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-600">Revoked</span>
                                    @elseif ($c->expires_at && \Illuminate\Support\Carbon::parse($c->expires_at)->isPast())
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Expired</span>
                                    @else
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">Active</span>
                                    @endif
                                </td>
                                <td class="px-5 py-3.5 text-brand-grey">{{ $c->expires_at ? \Illuminate\Support\Carbon::parse($c->expires_at)->toDateString() : 'Never' }}</td>
                                <td class="px-5 py-3.5 text-brand-grey">{{ \Illuminate\Support\Carbon::parse($c->created_at)->diffForHumans() }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="4" class="px-5 py-14 text-center text-brand-grey">No partner credentials issued yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5">
                <h3 class="text-base font-black text-brand-black tracking-tight">Recent webhook deliveries</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[640px]">
                    <tbody class="divide-y divide-black/5">
                        @forelse ($webhookEvents as $event)
                            <tr>
                                <td class="px-5 py-3 font-bold text-brand-dark">{{ $event->event_type }}</td>
                                <td class="px-5 py-3 text-brand-grey">{{ $event->delivery_id ?? '—' }}</td>
                                <td class="px-5 py-3 text-right text-brand-grey">{{ \Illuminate\Support\Carbon::parse($event->created_at)->diffForHumans() }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td class="px-5 py-10 text-center text-brand-grey">No webhook deliveries recorded yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
@endsection
