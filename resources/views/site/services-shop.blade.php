@extends('layouts.site')

@section('title', 'Shop — Alabiq')

@section('content')
    <div class="max-w-7xl mx-auto px-6 md:px-16 lg:px-20 pt-8">
        <a href="/services" class="inline-flex items-center gap-1.5 text-sm text-brand-grey hover:text-brand-orange transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Back to Services
        </a>
    </div>

    <section class="w-full bg-brand-light px-6 md:px-20 py-14">
        <div class="max-w-5xl mx-auto">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-red flex items-center justify-center shadow-lg shadow-brand-orange/20">
                    <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                </div>
                <span class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-surface text-brand-grey rounded-full border border-brand-border">
                    Coming soon
                </span>
            </div>

            <h1 class="text-4xl md:text-5xl font-black tracking-tight text-brand-black leading-tight">
                Shop — Stores &amp; Essentials
            </h1>
            <p class="text-brand-grey text-base md:text-lg leading-relaxed mt-4 max-w-2xl font-medium">
                Partner-store goods delivered within 15 km of each store — groceries, pharmacy,
                and daily essentials with the same live tracking and secure checkout you know
                from food delivery.
            </p>

            <div class="mt-10 rounded-3xl border border-dashed border-brand-border bg-white/60 px-6 py-14 text-center max-w-2xl">
                <p class="text-brand-dark text-sm font-bold">We are onboarding stores right now</p>
                <p class="text-brand-grey text-sm font-medium mt-1">
                    The shop vertical launches soon. Follow us on social media for the announcement.
                </p>
            </div>

            <div class="mt-10">
                <a href="/services" class="inline-flex items-center gap-2 text-sm font-bold text-brand-orange hover:text-brand-red transition-colors">
                    See live services
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
                </a>
            </div>
        </div>
    </section>
@endsection
