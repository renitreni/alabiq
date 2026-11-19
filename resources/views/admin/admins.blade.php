@extends('layouts.admin')

@section('title', 'Admins')
@php $activeNav = 'admins'; @endphp

@section('content')
    <div class="space-y-5">
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5">
                <h3 class="text-base font-black text-brand-black tracking-tight">Portal access</h3>
                <p class="text-xs text-brand-grey mt-0.5">Who has the admin role or super-admin flag.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[640px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Admin</th>
                            <th class="px-5 py-3">Email</th>
                            <th class="px-5 py-3">Tier</th>
                            <th class="px-5 py-3">Last sign in</th>
                            <th class="px-5 py-3">Joined</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($admins as $admin)
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3.5 font-bold text-brand-black">{{ $admin->full_name ?? '—' }}</td>
                                <td class="px-5 py-3.5 text-brand-dark">{{ $admin->email }}</td>
                                <td class="px-5 py-3.5">
                                    @if ($admin->is_super_admin)
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-brand-orange/10 text-brand-orange">
                                            Super admin
                                        </span>
                                    @else
                                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                                            Admin
                                        </span>
                                    @endif
                                </td>
                                <td class="px-5 py-3.5 text-brand-grey">{{ $admin->user?->last_login_at?->diffForHumans() ?? 'Never' }}</td>
                                <td class="px-5 py-3.5 text-brand-grey">{{ $admin->created_at?->diffForHumans() ?? '—' }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="5" class="px-5 py-14 text-center text-brand-grey">No admin accounts found.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-black/5">
                <h3 class="text-base font-black text-brand-black tracking-tight">Recent admin sign-ins</h3>
                <p class="text-xs text-brand-grey mt-0.5">Recorded from both the API and this portal.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[560px]">
                    <tbody class="divide-y divide-black/5">
                        @forelse ($loginEvents as $event)
                            <tr>
                                <td class="px-5 py-3 font-bold text-brand-dark">{{ $event->email }}</td>
                                <td class="px-5 py-3 text-brand-grey">{{ $event->ip ?? '—' }}</td>
                                <td class="px-5 py-3 text-brand-grey text-right">{{ \Illuminate\Support\Carbon::parse($event->occurred_at)->diffForHumans() }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td class="px-5 py-10 text-center text-brand-grey">No admin sign-ins recorded yet.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
@endsection
