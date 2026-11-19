@extends('layouts.site')

@section('title', 'Airport Pick & Drop — Alabiq')

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
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </div>
                <span class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-warm text-brand-orange rounded-full border border-brand-orange/15">
                    <span class="w-1.5 h-1.5 rounded-full bg-brand-orange"></span>
                    Live now
                </span>
            </div>

            <h1 class="text-4xl md:text-5xl font-black tracking-tight text-brand-black leading-tight">
                Airport Pick &amp; Drop
            </h1>
            <p class="text-brand-grey text-base md:text-lg leading-relaxed mt-4 max-w-2xl font-medium">
                Fixed-fare airport transfers across Riyadh. Tell us your terminal and district,
                see the exact fare before you confirm, pay securely, and track your driver on
                live GPS until you are at the curb.
            </p>

            @php
                $features = [
                    ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', 'Fixed fares', 'The full fare, including VAT, is shown before you confirm — no surprises.'],
                    ['M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z', 'Terminal aware', 'Meet your driver at the right terminal — we track your flight number for arrivals.'],
                    ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Verified drivers', 'Every driver is approved by our team before they can take a booking.'],
                ];
            @endphp
            <div class="grid sm:grid-cols-3 gap-4 mt-12">
                @foreach ($features as [$icon, $title, $desc])
                    <div class="bg-white border border-brand-border rounded-2xl p-5">
                        <span class="w-10 h-10 rounded-xl bg-brand-warm border border-brand-orange/15 flex items-center justify-center mb-3">
                            <svg class="w-5 h-5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/></svg>
                        </span>
                        <p class="text-sm font-black text-brand-black">{{ $title }}</p>
                        <p class="text-xs text-brand-grey font-medium mt-1.5 leading-relaxed">{{ $desc }}</p>
                    </div>
                @endforeach
            </div>

            <div class="mt-10 flex flex-wrap gap-3">
                <a href="/services" class="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black text-sm px-7 py-3.5 rounded-xl shadow-md shadow-brand-orange/25 transition-colors">
                    Book a ride
                </a>
                <a href="/help-center" class="inline-flex items-center gap-2 text-brand-dark font-bold text-sm px-5 py-3.5 rounded-xl border border-brand-border hover:border-brand-orange/30 hover:text-brand-orange transition-colors">
                    Help center
                </a>
            </div>
        </div>
    </section>
@endsection
