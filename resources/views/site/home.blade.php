@extends('layouts.site')

@section('title', 'Alabiq — Food delivery across Riyadh')
@section('content')

    {{-- Hero (port of sections/Hero.jsx) --}}
    <section id="home" class="relative w-full min-h-screen bg-brand-light flex items-center px-6 md:px-16 lg:px-20 pt-28 pb-16 overflow-hidden">
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div class="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full bg-brand-orange/8 blur-[120px]"></div>
            <div class="absolute bottom-0 -left-40 w-[420px] h-[420px] rounded-full bg-brand-red/5 blur-[100px]"></div>
            <div class="absolute inset-0" style="background-image: linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px); background-size: 64px 64px;"></div>
        </div>

        <div class="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 w-full max-w-7xl mx-auto items-center">
            <div class="flex flex-col items-start gap-5 lg:gap-6 order-2 lg:order-1">
                <div class="inline-flex items-center gap-2 bg-brand-warm border border-brand-orange/20 px-4 py-2 rounded-full text-brand-orange text-xs font-bold tracking-widest uppercase">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-60"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-brand-orange"></span>
                    </span>
                    Now delivering food across Riyadh
                </div>

                <h1 class="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight text-brand-black leading-[1.05]">
                    Craving something?
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">It's on its way.</span>
                </h1>

                <p class="text-brand-grey text-base md:text-lg leading-relaxed max-w-lg">
                    Alabiq brings Riyadh's best kitchens to your doorstep. Browse real
                    menus from verified partner restaurants, pay securely with STC Pay,
                    and watch your order arrive on live GPS — hot, fresh, and right on
                    time.
                </p>

                <form action="/services/food" method="get"
                      class="w-full max-w-xl flex flex-col sm:flex-row gap-3 p-1.5 rounded-2xl bg-white border border-brand-border shadow-lg shadow-brand-orange/5 focus-within:ring-2 focus-within:ring-brand-dark/40 focus-within:border-brand-dark">
                    <div class="flex items-center gap-3 px-4 flex-1 min-h-12">
                        <svg class="w-5 h-5 text-brand-grey shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"/>
                        </svg>
                        <input type="text" name="q" placeholder="Search restaurants or dishes..."
                               aria-label="Search restaurants or dishes"
                               class="w-full bg-transparent text-brand-dark placeholder-brand-grey text-sm focus:outline-none">
                    </div>
                    <button type="submit"
                            class="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-8 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-md shadow-brand-orange/25 whitespace-nowrap">
                        Find Food
                    </button>
                </form>

                {{-- Marketplace categories (sections/MarketplaceCategories.jsx) --}}
                <div class="w-full max-w-xl">
                    <p class="text-[11px] font-black uppercase tracking-wider text-brand-grey mb-2.5">Explore</p>
                    <div class="grid grid-cols-3 gap-2 sm:gap-3">
                        <a href="/services/food" class="flex flex-col items-center rounded-2xl border border-brand-border bg-white py-3 sm:py-3.5 px-1 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-brand-orange/30">
                            <span class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-orange-50 text-brand-orange flex items-center justify-center">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 002-2V2M7 2v20M17 2c-1.5 2-2 4.5-2 7h4v13"/></svg>
                            </span>
                            <span class="mt-1.5 text-[11px] sm:text-xs font-black text-brand-black text-center leading-tight">Food</span>
                            <span class="hidden sm:block text-[10px] font-medium text-brand-grey mt-0.5">Restaurants</span>
                        </a>
                        <a href="/services/food?tab=deals" class="flex flex-col items-center rounded-2xl border border-brand-border bg-white py-3 sm:py-3.5 px-1 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-rose-300">
                            <span class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 5L5 19M6.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM17.5 20a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/></svg>
                            </span>
                            <span class="mt-1.5 text-[11px] sm:text-xs font-black text-brand-black text-center leading-tight">Deals</span>
                            <span class="hidden sm:block text-[10px] font-medium text-brand-grey mt-0.5">Save more</span>
                        </a>
                        <a href="/services/food?tab=trending" class="flex flex-col items-center rounded-2xl border border-brand-border bg-white py-3 sm:py-3.5 px-1 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-amber-300">
                            <span class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2c1 3-1 4-2 6-.5 1-.5 2 0 3 .5-1.5 1.5-2 2.5-2.5C15 7 15 4 12 2zM10 13c-2 0-4 1.5-4 4 0 3 3 5 6 5s6-2 6-5c0-2-1.5-3.5-3-4 .5 1.5 0 3-1.5 3.5C12.5 15.5 10 15 10 13z"/></svg>
                            </span>
                            <span class="mt-1.5 text-[11px] sm:text-xs font-black text-brand-black text-center leading-tight">Trending</span>
                            <span class="hidden sm:block text-[10px] font-medium text-brand-grey mt-0.5">New &amp; hot</span>
                        </a>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-3">
                    <a href="/services/food"
                       class="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer shadow-md shadow-brand-orange/20">
                        Order Food Now
                    </a>
                    <a href="#how-it-works"
                       class="text-brand-dark hover:text-brand-orange font-bold text-sm px-5 py-3.5 rounded-xl border border-brand-border hover:border-brand-orange/30 transition-colors">
                        See How It Works
                    </a>
                </div>

                @php
                    $highlights = [
                        ['M3 2v7c0 1.1.9 2 2 2h2a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7', 'Real restaurant kitchens', 'Menus come straight from verified partner restaurants — what you see is what they cook.'],
                        ['M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z', 'Tracked door to door', 'Follow your rider on live GPS from the moment your order leaves the kitchen.'],
                        ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Verified payments', 'Pay by STC Pay transfer, upload your receipt, and we verify it before dispatch.'],
                    ];
                @endphp
                <div class="grid sm:grid-cols-3 gap-4 w-full max-w-xl">
                    @foreach ($highlights as [$icon, $title, $desc])
                        <div class="bg-white/70 backdrop-blur-sm border border-brand-border rounded-2xl p-4">
                            <span class="w-9 h-9 rounded-xl bg-brand-warm border border-brand-orange/15 flex items-center justify-center mb-3">
                                <svg class="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/></svg>
                            </span>
                            <p class="text-sm font-black text-brand-black leading-tight">{{ $title }}</p>
                            <p class="text-xs text-brand-grey font-medium mt-1.5 leading-relaxed">{{ $desc }}</p>
                        </div>
                    @endforeach
                </div>

                <div class="flex flex-wrap gap-6 sm:gap-8 pt-4 border-t border-brand-border w-full max-w-xl">
                    @foreach ([['15 km', 'Delivery radius'], ['Live GPS', 'Order tracking'], ['STC Pay', 'Secure payments'], ['24/7', 'Customer support']] as [$value, $label])
                        <div>
                            <p class="text-2xl font-black text-brand-black">{{ $value }}</p>
                            <p class="text-brand-grey text-xs font-medium uppercase tracking-wider mt-0.5">{{ $label }}</p>
                        </div>
                    @endforeach
                </div>
            </div>

            <div class="relative w-full flex justify-center lg:justify-end order-1 lg:order-2 py-4 lg:py-8">
                @include('site._phone_mockup')

                <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 lg:left-auto lg:right-6 lg:translate-x-0 z-20 flex items-center gap-2.5 bg-white border border-brand-border rounded-2xl px-4 py-3 shadow-xl">
                    <span class="w-9 h-9 rounded-xl bg-brand-orange/10 flex items-center justify-center">
                        <svg class="w-5 h-5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                    </span>
                    <div>
                        <p class="text-xs font-black text-brand-black leading-tight">Verified partners</p>
                        <p class="text-[10px] text-brand-grey mt-0.5">Every restaurant is vetted</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="absolute bottom-0 inset-x-0 pointer-events-none" aria-hidden="true">
            <div class="max-w-7xl mx-auto px-6 md:px-16 lg:px-20 pb-5 flex items-center gap-6 sm:gap-10">
                <div class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-grey/70">
                    <svg class="w-3.5 h-3.5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                    Fresh from the kitchen
                </div>
                <div class="hidden sm:flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-grey/70">
                    <svg class="w-3.5 h-3.5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
                    Riders on standby
                </div>
                <div class="hidden md:flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-brand-grey/70">
                    <svg class="w-3.5 h-3.5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>
                    Open late, every day
                </div>
            </div>
        </div>
    </section>

    {{-- Popular near you (sections/PopularNearYou.jsx — live from merchants table) --}}
    @if ($restaurants->isNotEmpty())
        <section class="w-full bg-white border-y border-brand-border py-10 sm:py-14 px-6 md:px-16 lg:px-20">
            <div class="max-w-7xl mx-auto">
                <div class="flex items-end justify-between gap-4 mb-6">
                    <div>
                        <p class="text-brand-orange text-xs font-bold tracking-widest uppercase">Food Delivery</p>
                        <h2 class="text-2xl sm:text-3xl font-black text-brand-black tracking-tight mt-1">Popular near you</h2>
                        <p class="text-sm text-brand-grey font-medium mt-1.5 max-w-lg">
                            Browse partner restaurants with live prices, delivery fees, and one-tap ordering.
                        </p>
                    </div>
                </div>

                <div class="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 no-scrollbar overscroll-x-contain">
                    @foreach ($restaurants as $r)
                        <div class="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                            <article class="group relative h-full bg-white border border-brand-border rounded-3xl overflow-hidden transition-all duration-300 {{ $r['isOpen'] ? 'hover:-translate-y-2 hover:border-brand-orange/30 hover:shadow-2xl hover:shadow-brand-orange/10' : 'opacity-70' }}">
                                <div class="relative h-44 sm:h-48 bg-white overflow-hidden">
                                    @if ($r['logo'])
                                        <img src="{{ $r['logo'] }}" alt="{{ $r['name'] }} logo" loading="lazy"
                                             class="absolute inset-0 w-full h-full object-contain p-5 sm:p-6 transition-transform duration-500 {{ $r['isOpen'] ? 'group-hover:scale-110' : 'grayscale' }}">
                                    @else
                                        <span class="absolute inset-0 flex items-center justify-center text-5xl font-black text-brand-orange/30">
                                            {{ strtoupper(substr(trim($r['name']), 0, 1)) ?: '?' }}
                                        </span>
                                    @endif

                                    @if ($r['badge'] && $r['isOpen'])
                                        <span class="absolute top-4 left-4 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full shadow-md bg-white/95 text-brand-orange">
                                            {{ $r['badge'] }}
                                        </span>
                                    @endif

                                    @unless ($r['isOpen'])
                                        <span class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 px-4 text-center">
                                            <span class="px-3 py-1 rounded-full bg-white text-brand-dark text-xs font-black uppercase tracking-wider">Closed</span>
                                            @if ($r['hoursLabel'])
                                                <span class="text-white text-xs font-bold">Opens {{ $r['hoursLabel'] }}</span>
                                            @endif
                                        </span>
                                    @endunless

                                    @if ($r['isOpen'] && $r['hoursLabel'])
                                        <div class="absolute bottom-4 left-4 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-brand-dark text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                            <svg class="w-3.5 h-3.5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 3"/></svg>
                                            {{ $r['hoursLabel'] }}
                                        </div>
                                    @endif
                                </div>

                                <div class="p-5 sm:p-6">
                                    <h3 class="text-lg font-black text-brand-black tracking-tight leading-snug mb-1.5 {{ $r['isOpen'] ? 'group-hover:text-brand-orange transition-colors' : '' }}">
                                        {{ $r['name'] }}
                                    </h3>
                                    @if ($r['tagline'])
                                        <p class="text-brand-grey text-sm font-medium mb-4 line-clamp-2">{{ $r['tagline'] }}</p>
                                    @endif

                                    <div class="flex items-center justify-between gap-2 pt-4 border-t border-brand-border">
                                        <span class="text-xs text-brand-grey font-medium">{{ $r['cuisine'] }}</span>
                                        @if ($r['isOpen'])
                                            <span class="inline-flex items-center gap-1.5 text-sm font-bold text-brand-orange">
                                                View
                                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
                                            </span>
                                        @endif
                                    </div>
                                </div>
                            </article>
                        </div>
                    @endforeach
                </div>

                <div class="mt-6 flex flex-wrap items-center gap-3">
                    <a href="/services/food"
                       class="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black text-sm px-6 py-3 rounded-xl shadow-md shadow-brand-orange/20 transition-colors">
                        Browse restaurants
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
                    </a>
                    @if ($partnersCount > 0)
                        <span class="text-xs font-bold text-brand-grey">
                            {{ $partnersCount }} partners
                            @if ($deliveryFeeLabel)
                                · delivery from {{ $deliveryFeeLabel }}
                            @endif
                            @if ($minOrder)
                                · min. SAR {{ rtrim(rtrim(number_format($minOrder, 2, '.', ''), '0'), '.') }}
                            @endif
                        </span>
                    @endif
                </div>
            </div>
        </section>
    @endif

    {{-- Services (sections/Services.jsx) --}}
    <section id="features" class="w-full bg-brand-muted px-6 md:px-20 py-24 border-t border-brand-border scroll-mt-24">
        <div class="max-w-7xl mx-auto">
            <div class="text-center md:text-left mb-16 max-w-2xl">
                <span class="text-brand-orange text-sm font-bold tracking-widest uppercase">Our Services</span>
                <h2 class="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
                    Riyadh's kitchens,<br class="hidden md:block">
                    <span class="text-brand-orange">delivered to your door.</span>
                </h2>
                <p class="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
                    Alabiq is a food delivery service built for Riyadh — real restaurant
                    menus, secure STC Pay checkout, and live tracking on every order.
                </p>
            </div>

            <div class="max-w-5xl">
                <a href="/services/food"
                   class="group relative bg-white border border-brand-border rounded-3xl p-8 md:p-10 flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/10 block">
                    <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-orange to-brand-red opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                    <div class="flex items-start justify-between mb-6">
                        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-red flex items-center justify-center shadow-lg shadow-brand-orange/20 group-hover:scale-105 transition-transform duration-300">
                            <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>
                        </div>
                        <span class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-brand-warm text-brand-orange rounded-full border border-brand-orange/15">
                            <span class="w-1.5 h-1.5 rounded-full bg-brand-orange"></span>
                            Live now
                        </span>
                    </div>

                    <h3 class="text-2xl font-black text-brand-black mb-3 tracking-tight group-hover:text-brand-orange transition-colors">Food Delivery</h3>

                    <p class="text-brand-grey text-sm md:text-base leading-relaxed mb-8 font-medium max-w-2xl">
                        Order from the best local restaurants and fast food chains with
                        lightning-fast delivery to your doorstep. Browse full menus, track
                        your rider live, and pay securely — all in one place.
                    </p>

                    @php
                        $foodFeatures = [
                            ['M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z', 'Live GPS tracking', 'Watch your rider move from the kitchen to your door in real time.'],
                            ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Verified payments', 'Pay by STC Pay transfer and upload your receipt — we verify before dispatch.'],
                            ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', 'Within 15 km', 'We deliver inside a 15 km radius so your food always arrives hot and fresh.'],
                        ];
                    @endphp
                    <div class="grid sm:grid-cols-3 gap-4 mb-8">
                        @foreach ($foodFeatures as [$icon, $title, $desc])
                            <div class="bg-brand-muted/60 border border-brand-border rounded-2xl p-4">
                                <span class="w-9 h-9 rounded-xl bg-brand-warm border border-brand-orange/15 flex items-center justify-center mb-3">
                                    <svg class="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/></svg>
                                </span>
                                <p class="text-sm font-black text-brand-black">{{ $title }}</p>
                                <p class="text-xs text-brand-grey font-medium mt-1 leading-relaxed">{{ $desc }}</p>
                            </div>
                        @endforeach
                    </div>

                    <span class="inline-flex items-center gap-2 text-sm font-bold text-brand-dark group-hover:text-brand-orange transition-colors">
                        Browse restaurants
                        <svg class="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
                    </span>
                </a>
            </div>

            <div class="mt-12 text-center">
                <a href="/services" class="inline-flex items-center gap-2 text-sm font-bold text-brand-orange hover:text-brand-red transition-colors">
                    See all services
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>
                </a>
            </div>
        </div>

        {{-- Featured partners marquee (sections/Logo.jsx) --}}
        @if ($logoPartners->isNotEmpty())
            <div class="mt-24 max-w-7xl mx-auto">
                <div class="relative flex items-center justify-center mb-12">
                    <div class="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-brand-border to-transparent"></div>
                    <span class="relative bg-brand-muted px-5 text-brand-orange text-sm font-bold tracking-widest uppercase">
                        Featured Restaurant Partners
                    </span>
                </div>

                <div class="relative">
                    <div class="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-brand-muted to-transparent z-10 pointer-events-none"></div>
                    <div class="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-brand-muted to-transparent z-10 pointer-events-none"></div>

                    <div class="overflow-hidden py-10 sm:py-12">
                        <div class="partner-marquee-track flex w-max items-center">
                            @foreach ($logoPartners as $logo => $name)
                                <div class="group relative shrink-0 mx-5 sm:mx-7 md:mx-8 z-0 hover:z-20 transition-transform duration-300 hover:scale-110">
                                    <div class="w-36 h-36 sm:w-40 sm:h-40 md:w-44 md:h-44 lg:w-48 lg:h-48 flex items-center justify-center bg-white border border-brand-border rounded-3xl p-6 sm:p-7 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-brand-orange/15 group-hover:border-brand-orange/30">
                                        <img src="{{ $logo }}" alt="{{ $name }} logo" class="max-h-full max-w-full object-contain" loading="lazy">
                                    </div>
                                </div>
                            @endforeach
                            {{-- Second copy keeps the -50% translate loop seamless --}}
                            @foreach ($logoPartners as $logo => $name)
                                <div class="group relative shrink-0 mx-5 sm:mx-7 md:mx-8 z-0 hover:z-20 transition-transform duration-300 hover:scale-110" aria-hidden="true">
                                    <div class="w-36 h-36 sm:w-40 sm:h-40 md:w-44 md:h-44 lg:w-48 lg:h-48 flex items-center justify-center bg-white border border-brand-border rounded-3xl p-6 sm:p-7">
                                        <img src="{{ $logo }}" alt="" class="max-h-full max-w-full object-contain" loading="lazy">
                                    </div>
                                </div>
                            @endforeach
                        </div>
                    </div>
                </div>
            </div>
        @endif
    </section>

    {{-- Video showcase (sections/VideoShowcase.jsx) --}}
    <section id="see-it-in-action" class="relative w-full bg-brand-dark px-6 md:px-20 py-24 border-t border-white/5 overflow-hidden">
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div class="absolute -top-32 right-0 w-[480px] h-[480px] rounded-full bg-brand-orange/10 blur-[120px]"></div>
            <div class="absolute bottom-0 -left-32 w-[360px] h-[360px] rounded-full bg-brand-red/8 blur-[100px]"></div>
        </div>

        <div class="max-w-7xl mx-auto relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div class="flex flex-col gap-6">
                <span class="text-brand-orange text-sm font-bold tracking-widest uppercase">See It In Action</span>

                <h2 class="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
                    Watch Alabiq
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">work for you</span>
                </h2>

                <p class="text-brand-grey text-base md:text-lg leading-relaxed max-w-lg">
                    From browsing restaurants to live order tracking, see how
                    Alabiq makes everyday delivery and booking effortless.
                </p>

                <ul class="space-y-3">
                    @foreach (["Order from Riyadh's best restaurants in one app", 'Real-time GPS tracking on every delivery', 'Secure STC Pay payments and instant notifications'] as $item)
                        <li class="flex items-start gap-3">
                            <span class="mt-0.5 w-5 h-5 rounded-full bg-brand-orange/20 text-brand-orange flex items-center justify-center text-xs shrink-0">✓</span>
                            <span class="text-white/80 text-sm md:text-base">{{ $item }}</span>
                        </li>
                    @endforeach
                </ul>
            </div>

            <div class="relative w-full">
                <div class="absolute -inset-4 bg-brand-orange/15 rounded-[2rem] blur-2xl opacity-60 pointer-events-none"></div>
                <div class="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40">
                    {{-- The original promo video (/media/alabiq-ads.mp4) never existed in any
                         repo, archive, or host copy — it 404'd since the Blade port. Replaced
                         with the on-brand full logo lockup (dark-background variant). --}}
                    <img src="/alabiq-logo-dark.png" alt="Alabiq — delivery across Riyadh"
                         class="w-full h-full object-contain bg-brand-dark p-8 md:p-12" />
                    <div class="absolute inset-0 bg-gradient-to-t from-brand-dark/70 via-transparent to-brand-dark/20 pointer-events-none"></div>
                </div>
            </div>
        </div>
    </section>

    {{-- How it works (sections/HowItWorks.jsx) --}}
    <section id="how-it-works" class="relative w-full bg-white px-6 md:px-20 py-24 border-t border-brand-border overflow-hidden scroll-mt-20">
        <div class="max-w-7xl mx-auto relative">
            <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 mb-12 md:mb-16">
                <div class="max-w-xl">
                    <span class="text-brand-orange text-sm font-bold tracking-widest uppercase">How It Works</span>
                    <h2 class="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
                        Order, pay, track —
                        <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">three easy steps.</span>
                    </h2>
                    <p class="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
                        No complicated menus or long forms. Your order is verified,
                        prepared, and tracked from the kitchen to your door.
                    </p>
                </div>

                <div class="flex flex-wrap gap-3 lg:justify-end">
                    @foreach ([['M13 10V3L4 14h7v7l9-11h-7z', 'Fast delivery'], ['M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z', 'Live tracking'], ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Secure payments'], ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', '24/7 support']] as [$icon, $label])
                        <span class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-warm border border-brand-orange/15 text-brand-dark text-xs font-bold">
                            <svg class="w-3.5 h-3.5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/></svg>
                            {{ $label }}
                        </span>
                    @endforeach
                </div>
            </div>

            @php
                $steps = [
                    ['01', 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', 'Download & sign in', 'Get the app on iOS or Android. Create your account in under a minute.', ['Free app', 'Quick setup'], 'from-brand-orange to-brand-red'],
                    ['02', 'M3 2v7c0 1.1.9 2 2 2h2a2 2 0 002-2V2M7 2v20', 'Pick your meal', 'Browse real menus from verified partner restaurants across Riyadh and build your order in a few taps.', ['Restaurants', 'Deals & offers'], 'from-orange-400 to-brand-orange'],
                    ['03', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'Pay with STC Pay & track live', 'Transfer via STC Pay and upload your receipt — we verify it before dispatch. Then follow your rider on live GPS until the food reaches your door.', ['Receipt upload', 'Verified before dispatch', 'Live GPS'], 'from-brand-red to-orange-500'],
                ];
            @endphp
            <div class="relative bg-brand-muted/80 border border-brand-border rounded-[2rem] p-6 md:p-10 lg:p-12">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-6">
                    @foreach ($steps as [$step, $icon, $title, $desc, $tags, $accent])
                        <div class="relative flex flex-col">
                            <div class="flex justify-center mb-6 lg:mb-8">
                                <div class="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-br {{ $accent }} flex items-center justify-center shadow-lg shadow-brand-orange/25 ring-4 ring-brand-muted">
                                    <svg class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/></svg>
                                </div>
                            </div>

                            <div class="flex-1 bg-white border border-brand-border rounded-3xl p-6 md:p-7 shadow-sm transition-all duration-300 hover:border-brand-orange/25 hover:shadow-xl group relative">
                                <div class="absolute top-5 right-5 text-5xl font-black text-brand-orange/8 group-hover:text-brand-orange/15 transition-colors select-none pointer-events-none">
                                    {{ $step }}
                                </div>

                                <span class="inline-block text-[10px] font-black uppercase tracking-widest text-brand-orange mb-3">Step {{ $step }}</span>
                                <h3 class="text-xl font-black text-brand-black tracking-tight mb-2 pr-8">{{ $title }}</h3>
                                <p class="text-brand-grey text-sm leading-relaxed mb-5">{{ $desc }}</p>

                                <div class="flex flex-wrap gap-2">
                                    @foreach ($tags as $tag)
                                        <span class="text-[11px] font-bold text-brand-grey bg-brand-surface px-3 py-1.5 rounded-lg border border-brand-border">{{ $tag }}</span>
                                    @endforeach
                                </div>

                                <div class="mt-6 h-1 w-12 rounded-full bg-gradient-to-r from-brand-orange to-brand-red opacity-40 group-hover:opacity-100 group-hover:w-16 transition-all duration-300"></div>
                            </div>
                        </div>
                    @endforeach
                </div>
            </div>
        </div>
    </section>

    {{-- Sponsored reel (sections/SponsoredReel.jsx — promo data from data/promotions.js) --}}
    <section id="sponsored-reel" class="relative w-full bg-brand-muted px-6 md:px-20 py-24 border-t border-brand-border overflow-hidden" aria-label="Taster sponsored reel">
        <div class="absolute -left-32 top-1/2 -translate-y-1/2 w-[360px] h-[360px] bg-brand-orange/5 rounded-full blur-[100px] pointer-events-none" aria-hidden="true"></div>

        <div class="max-w-7xl mx-auto relative">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div class="order-2 lg:order-1 flex flex-col items-center lg:items-start">
                    <div class="relative w-full flex justify-center lg:justify-start">
                        <div class="absolute -inset-4 rounded-[2.5rem] bg-brand-orange/10 blur-2xl opacity-70 pointer-events-none" aria-hidden="true"></div>
                        <a href="https://www.facebook.com/reel/1951260275808733" target="_blank" rel="noopener noreferrer"
                           class="relative block w-full max-w-sm aspect-[9/16] rounded-3xl overflow-hidden border border-brand-border bg-brand-dark shadow-2xl group">
                            <img src="/brands/taster.png" alt="Taster promo reel preview"
                                 class="absolute inset-0 w-full h-full object-contain bg-white p-8">
                            <span class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                                <span class="flex items-center justify-center w-16 h-16 rounded-full bg-brand-orange/90 text-white shadow-xl shadow-brand-orange/40">
                                    <svg class="w-7 h-7 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                </span>
                            </span>
                        </a>
                    </div>
                    <p class="text-center lg:text-left text-brand-grey text-xs mt-5 font-medium max-w-2xl">
                        Tap to watch the latest reel on Facebook.
                    </p>
                </div>

                <div class="flex flex-col gap-6 order-1 lg:order-2">
                    <div class="flex items-center gap-3">
                        <img src="/brands/taster.png" alt="Taster logo" class="w-14 h-14 rounded-2xl border border-brand-border bg-white object-contain p-2">
                        <span class="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand-dark text-white">Sponsored</span>
                    </div>

                    <span class="inline-flex items-center gap-2 text-brand-orange text-xs font-bold tracking-widest uppercase">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
                        Featured partner
                    </span>

                    <h2 class="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-brand-black leading-tight">
                        Watch the latest from
                        <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">Taster</span>
                    </h2>

                    <p class="text-brand-grey text-base md:text-lg leading-relaxed max-w-lg">
                        Catch our newest promo reel and discover comfort food favorites,
                        available to order on Alabiq.
                    </p>

                    <a href="/services/food"
                       class="inline-flex w-fit items-center justify-center bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-md shadow-brand-orange/25">
                        Order from Taster
                    </a>
                </div>
            </div>
        </div>
    </section>

    {{-- About (sections/AboutUs.jsx) --}}
    <section id="about" class="py-24 px-6 md:px-20 bg-white text-brand-dark border-t border-brand-border scroll-mt-20">
        <div class="max-w-6xl mx-auto">
            <div class="mb-16 text-center">
                <p class="text-brand-orange text-sm font-bold tracking-widest uppercase mb-3">About Us</p>
                <h2 class="text-3xl md:text-5xl font-black text-brand-black">Who We Are</h2>
            </div>

            <div class="grid md:grid-cols-2 gap-16 items-center">
                <div>
                    <h2 class="text-4xl md:text-5xl font-black mb-6 text-brand-black">
                        Empowering the <span class="text-brand-orange">Kingdom of Saudi Arabia's</span> Daily Rhythm.
                    </h2>
                    <p class="text-brand-grey text-lg leading-relaxed">
                        <span class="text-brand-black text-lg font-bold italic leading-relaxed">Alabiq</span>
                        was founded with a simple yet powerful vision: to bridge the gap between busy urban lifestyles and the food people love.
                        More than just an app, Alabiq is your trusted digital partner, connecting you effortlessly to Riyadh's best restaurants whenever and wherever hunger strikes.
                    </p>
                </div>

                <div class="border border-brand-orange/20 p-8 rounded-3xl bg-brand-warm">
                    <div class="text-brand-orange font-bold text-sm uppercase tracking-widest mb-4">Our Mission</div>
                    <p class="italic text-xl text-brand-dark">
                        "Our mission is to empower everyone in the Kingdom of Saudi Arabia with fast, secure, and reliable food delivery.
                        To ensure a seamless and hassle free experience where every order arrives hot, fresh, and exactly as promised."
                    </p>
                </div>
            </div>
        </div>
    </section>

    {{-- FAQ (sections/FAQ.jsx — Alpine accordion replaces React state) --}}
    @php
        $faqs = [
            ['What is Alabiq?', 'Alabiq is a food delivery app for Riyadh. Order from verified partner restaurants, pay securely with STC Pay, and follow your rider on live GPS tracking until the food reaches your door.'],
            ['How far do you deliver?', 'We deliver within a 15 km radius of each partner restaurant. Keeping deliveries close means your food always arrives hot and fresh.'],
            ['Which districts in Riyadh do you cover?', "We're currently active in Malaz, Sulamania, Olaya, and Batha, and constantly expanding to serve more areas soon."],
            ['How do I pay for my order?', "Pay by STC Pay bank transfer and upload your receipt in the app. Our team verifies the payment before your order is dispatched — you'll see the full total, including 15% VAT, before you confirm."],
            ['Can I track my order in real-time?', "Absolutely. Once your order is confirmed, you can track your rider's exact location via live GPS integration inside the app, from the kitchen to your doorstep."],
        ];
    @endphp
    <section id="faq" class="w-full bg-white px-6 md:px-20 py-24 border-t border-brand-border scroll-mt-20">
        <div class="max-w-3xl mx-auto" x-data="{ open: null }">
            <div class="text-center mb-14">
                <span class="text-brand-orange text-sm font-bold tracking-widest uppercase">FAQ</span>
                <h2 class="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2">
                    Know <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">Alabiq.</span>
                </h2>
                <p class="text-brand-grey text-base mt-4 font-medium max-w-xl mx-auto">
                    Quick answers about what the app does, where it works, and how it helps
                    you across Riyadh.
                </p>
            </div>

            <div class="bg-white rounded-3xl px-6 md:px-10 border border-brand-border shadow-sm shadow-brand-orange/5">
                @foreach ($faqs as $i => [$question, $answer])
                    <div class="border-b border-brand-border last:border-0">
                        <button @click="open = open === {{ $i }} ? null : {{ $i }}"
                                :aria-expanded="open === {{ $i }}"
                                class="w-full py-6 flex items-center justify-between gap-6 text-left group">
                            <span class="text-base md:text-lg font-bold tracking-tight transition-colors duration-200"
                                  :class="open === {{ $i }} ? 'text-brand-orange' : 'text-brand-black group-hover:text-brand-dark'">
                                {{ $question }}
                            </span>
                            <span class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200"
                                  :class="open === {{ $i }} ? 'bg-gradient-to-br from-brand-orange to-brand-red text-white shadow-md shadow-brand-orange/25' : 'border border-brand-border text-brand-grey group-hover:border-brand-orange/30 group-hover:text-brand-orange'">
                                <svg class="w-3.5 h-3.5 transition-transform duration-200" :class="open === {{ $i }} ? 'rotate-45' : ''" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14"/>
                                </svg>
                            </span>
                        </button>

                        <div x-show="open === {{ $i }}" x-cloak
                             x-transition:enter="transition ease-out duration-200"
                             x-transition:enter-start="opacity-0 -translate-y-1"
                             x-transition:enter-end="opacity-100 translate-y-0">
                            <p class="pb-6 text-sm md:text-base leading-relaxed text-brand-grey max-w-2xl">{{ $answer }}</p>
                        </div>
                    </div>
                @endforeach
            </div>

            <p class="text-center text-sm text-brand-grey mt-8 font-medium">
                Still need help?
                <a href="/support" class="font-bold text-brand-orange hover:underline">
                    Contact customer service →
                </a>
            </p>
        </div>
    </section>

@endsection
