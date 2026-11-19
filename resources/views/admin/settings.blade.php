@extends('layouts.admin')

@section('title', 'Settings')
@php $activeNav = 'settings'; @endphp

@section('content')
    <div class="space-y-5">
        <div class="bg-white rounded-2xl border border-black/[0.05] shadow-sm p-5 sm:p-6">
            <h3 class="text-base sm:text-lg font-black text-brand-black tracking-tight">Runtime settings</h3>
            <p class="text-sm text-brand-grey mt-0.5 mb-5">
                These live in <code class="text-brand-dark">app_settings</code> and apply without a deploy — the same table the API reads.
                Values are JSON: <code class="text-brand-dark">15</code>, <code class="text-brand-dark">true</code>,
                <code class="text-brand-dark">"text"</code> are all valid.
            </p>

            @if ($settings->isEmpty())
                <p class="text-sm text-brand-grey py-6 text-center">No runtime settings stored yet.</p>
            @else
                <div class="space-y-3">
                    @foreach ($settings as $setting)
                        <div class="border border-black/[0.06] rounded-2xl p-4">
                            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <code class="text-sm font-bold text-brand-dark">{{ $setting->key }}</code>
                                <span class="text-[11px] text-brand-grey">
                                    Updated {{ \Illuminate\Support\Carbon::parse($setting->updated_at)->diffForHumans() }}
                                </span>
                            </div>

                            <form method="POST" action="/admin/settings/{{ urlencode($setting->key) }}" class="flex flex-col sm:flex-row gap-2">
                                @csrf
                                <input type="text" name="value"
                                       value="{{ is_string($setting->value) ? $setting->value : json_encode($setting->value) }}"
                                       class="flex-1 bg-brand-muted/60 border border-brand-border rounded-xl px-3 py-2.5 text-sm font-mono text-brand-dark focus:border-brand-orange focus:outline-none">
                                <button type="submit"
                                        class="bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm shadow-brand-orange/25 shrink-0">
                                    Save
                                </button>
                            </form>
                        </div>
                    @endforeach
                </div>
            @endif
        </div>
    </div>
@endsection
