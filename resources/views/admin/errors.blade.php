@extends('layouts.admin')

@section('title', 'Errors')
@php $activeNav = 'errors'; @endphp

@section('content')
    <div class="space-y-5">
        <form method="GET" action="/admin/errors" class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-4 flex flex-wrap items-end gap-3">
            <label class="block">
                <span class="text-xs font-bold text-brand-dark">Severity</span>
                <select name="severity"
                        class="mt-1 block bg-white border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:border-brand-orange focus:outline-none">
                    <option value="">All severities</option>
                    @foreach (['error', 'warn', 'info'] as $s)
                        <option value="{{ $s }}" @selected(request('severity') === $s)>{{ ucfirst($s) }}</option>
                    @endforeach
                </select>
            </label>
            <button type="submit"
                    class="bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm shadow-brand-orange/25">
                Filter
            </button>
        </form>

        <div class="space-y-3">
            @forelse ($errorLogs as $e)
                @php
                    $severityColor = match ($e->severity) {
                        'warn' => '#F59E0B',
                        'info' => '#0EA5E9',
                        default => '#EF4444',
                    };
                @endphp
                <details class="group bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden">
                    <summary class="flex items-center gap-3 px-5 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-brand-muted/40 transition-colors">
                        <span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0"
                              style="background-color: {{ $severityColor }}15; color: {{ $severityColor }}">
                            {{ $e->severity }}
                        </span>
                        <div class="min-w-0 flex-1">
                            <p class="font-bold text-brand-black truncate">{{ $e->label }}</p>
                            <p class="text-xs text-brand-grey truncate">
                                {{ $e->method }} {{ $e->path ?? '—' }}
                                @if ($e->status_code) · HTTP {{ $e->status_code }} @endif
                                @if ($e->user_email) · {{ $e->user_email }} @endif
                            </p>
                        </div>
                        <span class="text-xs text-brand-grey whitespace-nowrap shrink-0">
                            {{ \Illuminate\Support\Carbon::parse($e->occurred_at)->diffForHumans() }}
                        </span>
                        <svg class="w-4 h-4 text-brand-grey shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <div class="px-5 pb-5 border-t border-black/5 pt-4">
                        <p class="text-sm text-brand-dark font-medium whitespace-pre-wrap">{{ $e->message }}</p>
                        @if ($e->error_name)
                            <p class="text-xs text-brand-grey mt-2"><span class="font-bold">{{ $e->error_name }}</span></p>
                        @endif
                        @if ($e->stack)
                            <pre class="mt-3 text-[11px] leading-relaxed bg-brand-muted rounded-xl p-4 overflow-x-auto text-brand-dark max-h-64">{{ \Illuminate\Support\Str::limit($e->stack, 4000) }}</pre>
                        @endif
                        @if ($e->suppressed_count > 0)
                            <p class="text-xs text-brand-grey mt-2">Suppressed duplicates: {{ $e->suppressed_count }}</p>
                        @endif
                    </div>
                </details>
            @empty
                <div class="bg-white rounded-2xl border border-black/[0.05] p-10 text-center text-sm text-brand-grey">
                    No logged errors. Either the system is healthy or nothing has errored in the retention window.
                </div>
            @endforelse
        </div>

        @if ($errorLogs->hasPages())
            <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm px-5 py-4">
                {{ $errorLogs->links() }}
            </div>
        @endif
    </div>
@endsection
