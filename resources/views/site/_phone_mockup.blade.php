{{-- Phone mockup hero visual — Blade/Alpine port of components/PhoneMockup.jsx.
     Data mirrors frontend/src/data/restaurants.js (illustrative mockup artwork
     only — NOT the live restaurant list). Screens auto-rotate every 4.5s like
     the React original; the flash banner cycles every 1.6s. --}}
@php
    $mockupRestaurants = [
        ['name' => 'Chowking', 'cuisine' => 'Chinese-Filipino', 'rating' => '4.9', 'timeShort' => '12 min', 'tag' => 'Top Rated', 'image' => '/brands/chowking.png', 'bg' => '#000000', 'cover' => false],
        ['name' => 'Black Pinoy', 'cuisine' => 'Filipino Homestyle', 'rating' => '4.8', 'timeShort' => '15 min', 'tag' => 'Popular', 'image' => '/brands/black-pinoy.png', 'bg' => '#FFFFFF', 'cover' => false],
        ['name' => 'Sarap Inasal', 'cuisine' => 'Grilled Chicken', 'rating' => '4.8', 'timeShort' => '18 min', 'tag' => 'Popular', 'image' => '/brands/sarap-inasal.png', 'bg' => '#000000', 'cover' => false],
        ['name' => 'Ka Inasal', 'cuisine' => 'Grilled Chicken', 'rating' => '4.8', 'timeShort' => '18 min', 'tag' => 'Popular', 'image' => '/brands/ka-inasal.png', 'bg' => '#C9A227', 'cover' => false],
        ['name' => 'Happy Ending', 'cuisine' => 'Filipino Street Food', 'rating' => '4.9', 'timeShort' => '10 min', 'tag' => 'Top Rated', 'image' => '/brands/happy-ending.png', 'bg' => '#FFFFFF', 'cover' => true],
        ['name' => 'Jollibee', 'cuisine' => 'Filipino Fast Food', 'rating' => '4.9', 'timeShort' => '12 min', 'tag' => 'Trending', 'image' => '/brands/jollibee.png', 'bg' => '#FFFFFF', 'cover' => false],
        ['name' => 'Tianlala', 'cuisine' => 'Milk Tea & Drinks', 'rating' => '4.8', 'timeShort' => '10 min', 'tag' => 'New', 'image' => '/brands/tianlala.png', 'bg' => '#FFEB3B', 'cover' => false],
        ['name' => "Kuy's", 'cuisine' => 'Filipino Street Eats', 'rating' => '4.6', 'timeShort' => '14 min', 'tag' => 'New', 'image' => '/brands/kuys.png', 'bg' => '#F3F4F6', 'cover' => false],
        ['name' => 'Taster', 'cuisine' => 'Comfort Food', 'rating' => '4.7', 'timeShort' => '20 min', 'tag' => 'Trending', 'image' => '/brands/taster.png', 'bg' => '#FFFFFF', 'cover' => false],
        ['name' => 'Chuchay Dried Seafoods', 'cuisine' => 'Dried Seafood', 'rating' => '4.8', 'timeShort' => '25 min', 'tag' => 'New', 'image' => '/brands/chuchay.png', 'bg' => '#FFFFFF', 'cover' => false],
        ['name' => 'Shamsieh Shöai Salami Meatshop', 'cuisine' => 'Meatshop', 'rating' => '4.8', 'timeShort' => '25 min', 'tag' => 'New', 'image' => '/brands/shamsieh-shoai-salami.png', 'bg' => '#FFFFFF', 'cover' => false],
    ];
    $flashRestaurants = array_slice($mockupRestaurants, 0, 4);
    $flashTaglines = ['Chinese-Filipino favorites', 'Authentic homestyle dishes', 'Unli rice & grilled chicken', 'Tatak Pinoy! Lasang Pinoy!'];
@endphp

<div x-data="{
        screen: 'food',
        flash: 0,
        rotator: null,
        init() {
            this.rotator = setInterval(() => { this.screen = this.screen === 'food' ? 'track' : 'food' }, 4500);
            setInterval(() => { this.flash = (this.flash + 1) % {{ count($flashRestaurants) }} }, 1600);
        },
        pick(s) {
            this.screen = s;
            clearInterval(this.rotator);
            this.rotator = setInterval(() => { this.screen = this.screen === 'food' ? 'track' : 'food' }, 4500);
        }
     }"
     class="relative w-full max-w-[480px] mx-auto lg:max-w-none">

    {{-- Ambient glow --}}
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[85%] bg-brand-orange/20 rounded-full blur-[80px] pointer-events-none"></div>
    <div class="absolute top-1/4 right-0 w-32 h-32 bg-orange-400/10 rounded-full blur-[60px] pointer-events-none"></div>

    {{-- Floating card: order confirmed --}}
    <div class="absolute -top-2 right-0 sm:right-4 z-30 bg-white text-brand-dark rounded-2xl px-4 py-3 shadow-xl border border-brand-border flex items-center gap-3 max-w-[200px]">
        <div class="w-10 h-10 rounded-xl bg-brand-orange flex items-center justify-center shrink-0 shadow-sm shadow-brand-orange/25">
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <div>
            <p class="text-xs font-black leading-tight">Order confirmed!</p>
            <p class="text-[10px] text-brand-grey mt-0.5">Arriving in 8 min</p>
        </div>
    </div>

    {{-- Floating card: average delivery --}}
    <div class="absolute left-0 sm:-left-6 top-[30%] z-30 bg-white border border-brand-border rounded-2xl px-5 py-4 shadow-xl hidden md:block">
        <p class="text-xs text-brand-grey font-medium">Average delivery</p>
        <p class="text-3xl font-black text-brand-black mt-1">~30 min</p>
        <p class="text-[10px] text-brand-orange font-bold mt-1">Within 15 km radius</p>
    </div>

    {{-- Floating card: live GPS --}}
    <div class="absolute right-0 sm:-right-4 bottom-[28%] z-30 bg-brand-orange rounded-2xl px-5 py-4 shadow-2xl shadow-brand-orange/40 hidden md:block">
        <p class="text-white text-3xl font-black leading-none flex items-center gap-2">
            Live
            <span class="relative flex h-2.5 w-2.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
        </p>
        <p class="text-white/60 text-[10px] mt-1.5">GPS tracking on every order</p>
    </div>

    {{-- Phone frame --}}
    <div class="relative w-full max-w-[255px] sm:max-w-[380px] lg:max-w-[400px] xl:max-w-[420px] mx-auto">
        <div class="relative">
            <div class="absolute -inset-[3px] rounded-[3.25rem] bg-gradient-to-br from-brand-orange via-orange-400/50 to-brand-orange/20 opacity-80"></div>

            <div class="relative bg-gradient-to-b from-brand-dark to-brand-black rounded-[3.15rem] p-[10px] shadow-[0_40px_80px_-20px_rgba(17,24,39,0.35)]">
                {{-- Notch --}}
                <div class="absolute top-[18px] left-1/2 -translate-x-1/2 z-30 w-[100px] h-[28px] bg-brand-black rounded-full border border-brand-border/20 flex items-center justify-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-brand-orange animate-pulse"></div>
                    <div class="w-12 h-1.5 rounded-full bg-white/15"></div>
                </div>

                <div class="relative bg-brand-light rounded-[2.75rem] overflow-hidden border border-brand-border/30">
                    {{-- Status bar --}}
                    <div class="flex items-center justify-between px-7 pt-4 pb-2 text-[11px] text-brand-grey font-medium bg-brand-light">
                        <span class="text-brand-black font-semibold">9:41</span>
                        <div class="flex gap-2 items-center text-[10px] text-brand-dark">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>
                            <span>5G</span>
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="16" height="12" rx="2"/><path d="M6 10v4"/><path d="M10 10v4"/><path d="M14 10v4"/><path d="M22 14v-4"/></svg>
                        </div>
                    </div>

                    {{-- Screens --}}
                    <div class="h-[390px] sm:h-[560px] lg:h-[580px] relative overflow-hidden">

                        {{-- Food screen --}}
                        <div x-show="screen === 'food'"
                             x-transition:enter="transition ease-out duration-300"
                             x-transition:enter-start="opacity-0 scale-96 translate-y-3"
                             x-transition:enter-end="opacity-100 scale-100 translate-y-0"
                             x-transition:leave="transition ease-in duration-200"
                             x-transition:leave-start="opacity-100"
                             x-transition:leave-end="opacity-0"
                             class="absolute inset-0">
                            <div class="flex flex-col h-full bg-brand-muted text-brand-dark overflow-hidden">
                                {{-- Flash banner --}}
                                <div class="relative h-36 mx-3 mt-1 rounded-2xl overflow-hidden shrink-0 shadow-sm">
                                    @foreach ($flashRestaurants as $i => $r)
                                        <div x-show="flash === {{ $i }}"
                                             x-transition:enter="transition ease-out duration-300"
                                             x-transition:enter-start="opacity-0"
                                             x-transition:enter-end="opacity-100"
                                             x-transition:leave="transition ease-in duration-200 absolute inset-0"
                                             x-transition:leave-start="opacity-100"
                                             x-transition:leave-end="opacity-0"
                                             class="absolute inset-0"
                                             @if ($i > 0) x-cloak @endif
                                             style="background-color: {{ $r['bg'] }}">
                                            <img src="{{ $r['image'] }}" alt="{{ $r['name'] }}"
                                                 class="absolute inset-0 w-full h-full {{ $r['cover'] ? 'object-cover' : 'object-contain p-3' }}">
                                        </div>
                                    @endforeach
                                    <div class="absolute inset-0 bg-gradient-to-t from-brand-black/45 via-transparent to-transparent pointer-events-none"></div>
                                    <div class="absolute inset-0 p-4 flex flex-col justify-end pointer-events-none">
                                        <span class="text-[10px] font-bold uppercase tracking-wider text-white bg-brand-orange px-2 py-0.5 rounded-full mb-1.5 w-fit shadow-sm">
                                            Fast delivery
                                        </span>
                                        @foreach ($flashRestaurants as $i => $r)
                                            <p x-show="flash === {{ $i }}" x-cloak class="text-sm font-black leading-tight text-white drop-shadow">
                                                {{ $r['name'] }}: {{ $flashTaglines[$i] }}
                                            </p>
                                        @endforeach
                                    </div>
                                </div>

                                {{-- Deliver-to + search --}}
                                <div class="px-3 pt-3 pb-2">
                                    <div class="flex items-center justify-between mb-2.5">
                                        <div>
                                            <p class="text-[11px] text-brand-grey">Deliver to</p>
                                            <p class="text-sm font-bold text-brand-black flex items-center gap-1">
                                                Riyadh, Al Olaya
                                                <svg class="w-3.5 h-3.5 text-brand-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                            </p>
                                        </div>
                                        <div class="w-10 h-10 rounded-full bg-brand-orange flex items-center justify-center shadow-md shadow-brand-orange/25">
                                            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2.5 bg-white border border-brand-border rounded-2xl px-4 py-3 shadow-sm">
                                        <svg class="w-4 h-4 text-brand-grey shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
                                        <span class="text-brand-grey text-sm">Search restaurants...</span>
                                    </div>
                                </div>

                                {{-- Category pills --}}
                                <div class="flex gap-2 px-3 mb-3">
                                    <span class="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap bg-brand-orange text-white shadow-md shadow-brand-orange/25">
                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>
                                        Food
                                    </span>
                                    <span class="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap bg-white text-brand-grey border border-brand-border">
                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                                        Deals
                                    </span>
                                </div>

                                {{-- Popular near you --}}
                                <div class="px-3 mb-2 flex items-center gap-1.5">
                                    <svg class="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                                    <p class="text-sm font-black text-brand-black">Popular near you</p>
                                </div>

                                <div class="flex-1 overflow-y-auto px-3 space-y-3 pb-3">
                                    @foreach ($mockupRestaurants as $r)
                                        <div class="flex gap-3 bg-white border border-brand-border rounded-2xl p-2.5 shadow-sm">
                                            <div class="relative w-20 h-20 rounded-xl shrink-0 overflow-hidden" style="background-color: {{ $r['bg'] }}">
                                                <img src="{{ $r['image'] }}" alt="{{ $r['name'] }}"
                                                     class="w-full h-full {{ $r['cover'] ? 'object-cover' : 'object-contain p-1.5' }}">
                                            </div>
                                            <div class="flex-1 min-w-0 py-0.5">
                                                <div class="flex items-center gap-2 mb-0.5">
                                                    <p class="text-sm font-bold text-brand-black truncate">{{ $r['name'] }}</p>
                                                    <span class="text-[9px] font-bold bg-brand-warm text-brand-orange px-1.5 py-0.5 rounded-full shrink-0">
                                                        {{ $r['tag'] }}
                                                    </span>
                                                </div>
                                                <p class="text-xs text-brand-grey">{{ $r['cuisine'] }}</p>
                                                <div class="flex items-center gap-3 mt-2">
                                                    <span class="inline-flex items-center gap-1 text-xs text-brand-orange font-black">
                                                        <svg class="w-3.5 h-3.5 fill-brand-orange" viewBox="0 0 24 24" stroke="none"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>
                                                        {{ $r['rating'] }}
                                                    </span>
                                                    <span class="inline-flex items-center gap-1 text-xs text-brand-grey">
                                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                                        {{ $r['timeShort'] }}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    @endforeach
                                </div>

                                {{-- Bottom nav --}}
                                <div class="flex justify-around py-3 border-t border-brand-border bg-white shrink-0">
                                    <svg class="w-5 h-5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                                    <svg class="w-5 h-5 text-brand-grey/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
                                    <svg class="w-5 h-5 text-brand-grey/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/></svg>
                                    <svg class="w-5 h-5 text-brand-grey/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                </div>
                            </div>
                        </div>

                        {{-- Live-tracking screen --}}
                        <div x-show="screen === 'track'"
                             x-cloak
                             x-transition:enter="transition ease-out duration-300"
                             x-transition:enter-start="opacity-0 scale-96 -translate-y-3"
                             x-transition:enter-end="opacity-100 scale-100 translate-y-0"
                             x-transition:leave="transition ease-in duration-200"
                             x-transition:leave-start="opacity-100"
                             x-transition:leave-end="opacity-0"
                             class="absolute inset-0">
                            <div class="flex flex-col h-full bg-brand-muted text-brand-dark overflow-hidden">
                                <div class="px-4 pt-3 pb-3">
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <p class="text-sm font-black text-brand-black flex items-center gap-1.5">
                                                <svg class="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>
                                                Order on the way!
                                            </p>
                                            <p class="text-xs text-brand-grey mt-0.5">Chowking • #SM-2847</p>
                                        </div>
                                        <div class="bg-brand-warm text-brand-orange text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-brand-orange/20">
                                            <span class="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse"></span>
                                            LIVE
                                        </div>
                                    </div>
                                </div>

                                {{-- Map --}}
                                <div class="relative mx-3 flex-1 rounded-2xl overflow-hidden border border-brand-border min-h-0 shadow-sm">
                                    <div class="absolute inset-0 bg-gradient-to-br from-brand-warm via-brand-surface to-white"></div>
                                    <div class="absolute inset-0 opacity-40"
                                         style="background-image: linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px); background-size: 24px 24px;"></div>
                                    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 300 400" preserveAspectRatio="none">
                                        <path d="M50 340 Q120 280 180 200 T280 80" fill="none" stroke="var(--color-brand-orange)" stroke-width="4" stroke-linecap="round" opacity="0.9"/>
                                        <circle cx="50" cy="340" r="10" fill="var(--color-brand-orange)"/>
                                        <circle cx="280" cy="80" r="10" fill="var(--color-brand-red)"/>
                                    </svg>
                                    <div class="absolute top-[35%] left-[55%] w-12 h-12 rounded-full bg-brand-orange/15 border-2 border-brand-orange flex items-center justify-center shadow-md shadow-brand-orange/20 animate-pulse">
                                        <svg class="w-6 h-6 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
                                    </div>
                                    <div class="absolute top-4 left-4 bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 border border-brand-border shadow-sm">
                                        <p class="text-[10px] text-brand-grey">Est. arrival</p>
                                        <p class="text-2xl font-black text-brand-orange">8 min</p>
                                    </div>
                                </div>

                                {{-- Rider card --}}
                                <div class="mx-3 mt-3 bg-white border border-brand-border rounded-2xl p-4 shrink-0 shadow-sm">
                                    <div class="flex items-center gap-4">
                                        <div class="w-12 h-12 rounded-full bg-brand-warm flex items-center justify-center border border-brand-orange/20">
                                            <svg class="w-7 h-7 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>
                                        </div>
                                        <div class="flex-1">
                                            <p class="text-sm font-black text-brand-black">Ahmed is delivering</p>
                                            <p class="text-xs text-brand-grey">Delivery rider • 2 min away</p>
                                        </div>
                                        <div class="bg-brand-orange text-white p-2.5 rounded-xl shadow-md shadow-brand-orange/25">
                                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>
                                        </div>
                                    </div>
                                    <div class="mt-4 flex gap-1">
                                        @foreach (['Preparing', 'On the way', 'Delivered'] as $i => $step)
                                            <div class="flex-1">
                                                <div class="h-2 rounded-full {{ $i < 2 ? 'bg-brand-orange' : 'bg-brand-surface' }}"></div>
                                                <p class="text-[9px] mt-1.5 font-semibold {{ $i < 2 ? 'text-brand-black' : 'text-brand-grey' }}">{{ $step }}</p>
                                            </div>
                                        @endforeach
                                    </div>
                                </div>

                                <div class="h-4 shrink-0"></div>
                            </div>
                        </div>
                    </div>

                    {{-- Home indicator --}}
                    <div class="flex justify-center py-3 bg-brand-light">
                        <div class="w-28 h-1 rounded-full bg-brand-border"></div>
                    </div>
                </div>
            </div>

            {{-- Side buttons --}}
            <div class="absolute right-[-4px] top-28 w-1.5 h-14 bg-brand-dark rounded-r-md"></div>
            <div class="absolute left-[-4px] top-24 w-1.5 h-8 bg-brand-dark rounded-l-md"></div>
            <div class="absolute left-[-4px] top-36 w-1.5 h-14 bg-brand-dark rounded-l-md"></div>
        </div>
    </div>

    {{-- Screen tabs --}}
    <div class="flex items-center justify-center gap-2 mt-8 p-1.5 bg-white border border-brand-border rounded-2xl shadow-sm w-fit mx-auto">
        <button @click="pick('food')" aria-label="Show Food screen"
                :class="screen === 'food' ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/25 scale-105' : 'text-brand-grey hover:text-brand-dark hover:bg-brand-surface'"
                class="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="screen === 'food' ? 2.25 : 2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>
            Food
        </button>
        <button @click="pick('track')" aria-label="Show Live Tracking screen"
                :class="screen === 'track' ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/25 scale-105' : 'text-brand-grey hover:text-brand-dark hover:bg-brand-surface'"
                class="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="screen === 'track' ? 2.25 : 2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
            Live Tracking
        </button>
    </div>
</div>
