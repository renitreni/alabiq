@extends('layouts.site')

@section('title', 'Services — Alabiq')

@section('content')
    <section class="w-full bg-brand-muted px-6 md:px-20 py-16 border-t border-brand-border">
        <div class="max-w-7xl mx-auto">
            <div class="text-center max-w-2xl mx-auto mb-14">
                <span class="text-brand-orange text-sm font-bold tracking-widest uppercase">Services</span>
                <h1 class="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
                    Everything you need, <span class="text-brand-orange">one app.</span>
                </h1>
                <p class="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
                    Food from Riyadh's best kitchens, essentials from partner stores, and
                    fixed-fare airport rides — browse, order, and track it all live.
                </p>
            </div>

            @php
                $services = [
                    [
                        'title' => 'Food',
                        'subtitle' => 'Restaurants near you',
                        'href' => '/services/food',
                        'live' => true,
                        'icon' => 'M3 2v7c0 1.1.9 2 2 2h2a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
                        'desc' => 'Order from verified partner restaurants with live menus, STC Pay checkout, and GPS-tracked riders.',
                    ],
                    [
                        'title' => 'Rides',
                        'subtitle' => 'Airport pick & drop',
                        'href' => '/services/pick-drop',
                        'live' => true,
                        'icon' => 'M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
                        'desc' => 'Fixed-fare airport transfers across Riyadh. Choose your terminal and district, pay in the app, and track your driver live.',
                    ],
                    [
                        'title' => 'Shop',
                        'subtitle' => 'Stores & essentials',
                        'href' => '/services/shop',
                        'live' => false,
                        'icon' => 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
                        'desc' => 'Partner-store goods delivered within 15 km — launching soon.',
                    ],
                ];
            @endphp

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                @foreach ($services as $s)
                    <a href="{{ $s['href'] }}"
                       class="group relative bg-white border border-brand-border rounded-3xl p-8 flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/10 {{ $s['live'] ? '' : 'opacity-80' }}">
                        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-orange to-brand-red opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                        <div class="flex items-start justify-between mb-6">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-red flex items-center justify-center shadow-lg shadow-brand-orange/20 group-hover:scale-105 transition-transform duration-300">
                                <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="{{ $s['icon'] }}"/>
                                </svg>
                            </div>
                            @if ($s['live'])
                                <span class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-warm text-brand-orange rounded-full border border-brand-orange/15">
                                    <span class="w-1.5 h-1.5 rounded-full bg-brand-orange"></span>
                                    Live now
                                </span>
                            @else
                                <span class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-surface text-brand-grey rounded-full border border-brand-border">
                                    Coming soon
                                </span>
                            @endif
                        </div>

                        <p class="text-brand-grey text-xs font-bold uppercase tracking-widest">{{ $s['subtitle'] }}</p>
                        <h2 class="text-2xl font-black text-brand-black tracking-tight mt-1 group-hover:text-brand-orange transition-colors">{{ $s['title'] }}</h2>
                        <p class="text-brand-grey text-sm leading-relaxed mt-3 font-medium flex-1">{{ $s['desc'] }}</p>

                        <span class="mt-6 inline-flex items-center gap-2 text-sm font-bold text-brand-dark group-hover:text-brand-orange transition-colors">
                            {{ $s['live'] ? 'Open' : 'Preview' }}
                            <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/>
                            </svg>
                        </span>
                    </a>
                @endforeach
            </div>

            <div class="mt-16 max-w-4xl mx-auto">
                <h2 class="text-xl font-black text-brand-black text-center mb-8">How ordering works</h2>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    @foreach ([['M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z', 'Browse', 'Pick food, a store, or an airport ride.'], ['M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', 'Order or book', 'Pay in the app — fare and totals are shown first.'], ['M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z', 'Track live', 'Follow the kitchen, the rider, or your driver.']] as [$icon, $title, $desc])
                        <div class="text-center">
                            <span class="mx-auto w-12 h-12 rounded-2xl bg-brand-warm border border-brand-orange/15 flex items-center justify-center mb-3">
                                <svg class="w-5 h-5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/>
                                </svg>
                            </span>
                            <p class="text-sm font-black text-brand-black">{{ $title }}</p>
                            <p class="text-xs text-brand-grey font-medium mt-1 leading-relaxed">{{ $desc }}</p>
                        </div>
                    @endforeach
                </div>
            </div>
        </div>
    </section>
@endsection
