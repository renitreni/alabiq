@extends('layouts.admin')

@section('title', 'Drivers')
@php $activeNav = 'drivers'; @endphp

@section('content')
    @php
        $verificationMeta = [
            'approved' => ['Approved', '#22C55E'],
            'pending' => ['Pending', '#F59E0B'],
            'rejected' => ['Rejected', '#EF4444'],
        ];
    @endphp

    <div class="space-y-5">
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[860px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3.5">Driver</th>
                            <th class="px-5 py-3.5">Contact</th>
                            <th class="px-5 py-3.5">Vehicle</th>
                            <th class="px-5 py-3.5">Documents</th>
                            <th class="px-5 py-3.5">Verification</th>
                            <th class="px-5 py-3.5">Joined</th>
                            <th class="px-5 py-3.5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($drivers as $driver)
                            @php
                                $approved = (bool) $driver->driver_approved;
                                $status = $verificationMeta[$driver->driver_verification_status] ?? $verificationMeta[$approved ? 'approved' : 'pending'];
                            @endphp
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-4">
                                    <div class="flex items-center gap-3">
                                        <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-orange to-brand-red text-white flex items-center justify-center font-black text-xs shrink-0">
                                            {{ strtoupper(substr($driver->full_name ?: 'D', 0, 1)) }}
                                        </span>
                                        <div class="min-w-0">
                                            <p class="font-bold text-brand-black truncate">{{ $driver->full_name ?? 'Unnamed' }}</p>
                                            <p class="text-xs text-brand-grey">{{ $driver->national_id ?? '—' }}</p>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-5 py-4">
                                    <p class="text-brand-dark">{{ $driver->mobile_number ?? '—' }}</p>
                                    <p class="text-xs text-brand-grey">{{ $driver->whatsapp_number ?? '' }}</p>
                                </td>
                                <td class="px-5 py-4 text-brand-dark">
                                    {{ $driver->vehicle_type ?? '—' }}
                                    <p class="text-xs text-brand-grey">{{ $driver->vehicle_plate ?? '' }}</p>
                                </td>
                                <td class="px-5 py-4 tabular-nums text-brand-dark">{{ $driver->documents_count }}</td>
                                <td class="px-5 py-4">
                                    <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                                          style="background-color: {{ $status[1] }}15; color: {{ $status[1] }}">
                                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: {{ $status[1] }}"></span>
                                        {{ $status[0] }}
                                    </span>
                                </td>
                                <td class="px-5 py-4 text-brand-grey whitespace-nowrap">{{ $driver->created_at?->diffForHumans() ?? '—' }}</td>
                                <td class="px-5 py-4">
                                    <div class="flex items-center justify-end gap-2">
                                        @if ($approved)
                                            <form method="POST" action="/admin/drivers/{{ $driver->id }}/approval"
                                                  onsubmit="return confirm('Reject {{ addslashes($driver->full_name ?? 'this driver') }}? They will not be able to go online.')">
                                                @csrf
                                                <input type="hidden" name="approved" value="0">
                                                <button type="submit"
                                                        class="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl hover:bg-rose-100 transition-colors cursor-pointer">
                                                    Reject
                                                </button>
                                            </form>
                                        @else
                                            <form method="POST" action="/admin/drivers/{{ $driver->id }}/approval">
                                                @csrf
                                                <input type="hidden" name="approved" value="1">
                                                <button type="submit"
                                                        class="text-xs font-bold text-white bg-emerald-500 px-3 py-2 rounded-xl hover:bg-emerald-600 transition-colors cursor-pointer">
                                                    Approve
                                                </button>
                                            </form>
                                        @endif
                                    </div>
                                </td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="7" class="px-5 py-14 text-center text-brand-grey">No driver signups yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            @if ($drivers->hasPages())
                <div class="px-5 py-4 border-t border-black/5">
                    {{ $drivers->links() }}
                </div>
            @endif
        </div>

        <p class="text-xs text-brand-grey">
            Approval mirrors the Express admin exactly: it flips
            <code class="text-brand-dark">profiles.driver_approved</code> and keeps
            <code class="text-brand-dark">driver_verification_status</code> in step. Document-level review stays in the API.
        </p>
    </div>
@endsection
