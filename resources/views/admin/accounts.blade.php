@extends('layouts.admin')

@section('title', 'Accounts')
@php $activeNav = 'accounts'; @endphp

@section('content')
    <div class="space-y-5">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            @foreach ($roles as $role)
                <a href="/admin/accounts?role={{ $role }}"
                   class="bg-white rounded-2xl border {{ request('role') === $role ? 'border-brand-orange/40 shadow-md shadow-brand-orange/10' : 'border-black/[0.05]' }} shadow-sm px-4 py-3 transition-all">
                    <p class="text-[10px] font-bold uppercase tracking-wider {{ request('role') === $role ? 'text-brand-orange' : 'text-brand-grey' }}">{{ ucfirst($role) }}s</p>
                    <p class="text-xl font-black text-brand-black tabular-nums mt-1">{{ $roleCounts[$role] ?? 0 }}</p>
                </a>
            @endforeach
        </div>

        <form method="GET" action="/admin/accounts" class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 flex flex-wrap items-end gap-3">
            @if (request('role'))
                <input type="hidden" name="role" value="{{ request('role') }}">
            @endif
            <label class="block flex-1 min-w-48">
                <span class="text-xs font-bold text-brand-dark">Search name or email</span>
                <input type="text" name="q" value="{{ request('q') }}" placeholder="Search…"
                       class="mt-1 w-full bg-white border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-orange focus:outline-none">
            </label>
            <button type="submit"
                    class="bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm shadow-brand-orange/25">
                Search
            </button>
            <a href="/admin/accounts" class="text-sm font-bold text-brand-grey hover:text-brand-orange px-3 py-2.5">Reset</a>
        </form>

        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm min-w-[820px]">
                    <thead>
                        <tr class="text-left text-xs font-bold uppercase tracking-wider text-brand-grey bg-brand-muted/60 border-b border-black/5">
                            <th class="px-5 py-3">Name</th>
                            <th class="px-5 py-3">Email</th>
                            <th class="px-5 py-3">Role</th>
                            <th class="px-5 py-3">Mobile</th>
                            <th class="px-5 py-3">State</th>
                            <th class="px-5 py-3">Joined</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-black/5">
                        @forelse ($accounts as $account)
                            <tr class="hover:bg-brand-muted/40 transition-colors">
                                <td class="px-5 py-3.5 font-bold text-brand-black">{{ $account->full_name ?? '—' }}</td>
                                <td class="px-5 py-3.5 text-brand-dark">{{ $account->email }}</td>
                                <td class="px-5 py-3.5">
                                    <span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-brand-warm text-brand-orange border border-brand-orange/15">
                                        {{ ucfirst($account->role ?? 'unknown') }}
                                    </span>
                                </td>
                                <td class="px-5 py-3.5 text-brand-grey">{{ $account->mobile_number ?? '—' }}</td>
                                <td class="px-5 py-3.5">
                                    @if ($account->disabled_at || $account->user?->disabled_at)
                                        <span class="text-xs font-bold text-rose-600">Disabled</span>
                                    @else
                                        <span class="text-xs font-bold text-emerald-600">Active</span>
                                    @endif
                                </td>
                                <td class="px-5 py-3.5 text-brand-grey whitespace-nowrap">{{ $account->created_at?->diffForHumans() ?? '—' }}</td>
                            </tr>
                        @empty
                            <tr>
                                <td colspan="6" class="px-5 py-14 text-center text-brand-grey">No accounts match these filters.</td>
                            </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            @if ($accounts->hasPages())
                <div class="px-5 py-4 border-t border-black/5">
                    {{ $accounts->links() }}
                </div>
            @endif
        </div>
    </div>
@endsection
