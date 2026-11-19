@extends('layouts.site')

@section('title', "Demo Restaurant — Alabiq")

{{--
    /demo/restaurant — Blade port of the archived React demo page. DEMO-ONLY:
    every dish and price comes from fixture data in PageController::demoRestaurant.
    The cart below is Alpine state held in memory for the session of the page —
    nothing is posted, nothing is persisted, and checkout is disabled by design.
--}}

@section('content')
<div x-data="{
        cart: {},
        drawer: false,
        notice: false,
        add(id, name, price) {
            if (!this.cart[id]) { this.cart[id] = { name, price, qty: 0 }; }
            this.cart[id].qty++;
        },
        dec(id) {
            if (!this.cart[id]) return;
            this.cart[id].qty--;
            if (this.cart[id].qty <= 0) delete this.cart[id];
        },
        count() { return Object.values(this.cart).reduce((n, i) => n + i.qty, 0); },
        subtotal() { return Object.values(this.cart).reduce((n, i) => n + i.qty * i.price, 0); },
        fee() { return this.subtotal() > 0 ? {{ $restaurant['deliveryFee'] }} : 0; },
        total() { return this.subtotal() + this.fee(); },
        fmt(n) { return 'SAR ' + n.toFixed(2); },
        checkout() {
            this.notice = true;
            setTimeout(() => this.notice = false, 4000);
        },
     }">

    {{-- The banner is not decoration: without it a visitor would read the
         dishes and prices as orderable. Same role as the React demo banner. --}}
    <div class="sticky top-20 z-40 flex items-center justify-center gap-2 px-4 py-2 bg-amber-400 text-brand-black text-center">
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 2v6.5L4.5 18a2 2 0 001.8 3h11.4a2 2 0 001.8-3L14 8.5V2M8.5 2h7M7 15h10"/>
        </svg>
        <p class="text-xs sm:text-sm font-bold">
            Demo data. Every dish and price on this page is made up — nothing here can be ordered.
        </p>
    </div>

    <section class="w-full px-6 md:px-20 py-10">
        <div class="max-w-5xl mx-auto">

            {{-- Restaurant header --}}
            <div class="bg-white border border-brand-border rounded-3xl p-6 md:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
                <div class="w-20 h-20 rounded-2xl bg-red-700 text-white flex items-center justify-center text-3xl font-black shrink-0">
                    {{ mb_substr($restaurant['name'], 0, 1) }}
                </div>
                <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2.5">
                        <h1 class="text-2xl md:text-3xl font-black tracking-tight text-brand-black">{{ $restaurant['name'] }}</h1>
                        @if ($restaurant['badge'])
                            <span class="inline-flex items-center text-xs font-bold px-3 py-1 bg-brand-warm text-brand-orange rounded-full border border-brand-orange/15">{{ $restaurant['badge'] }}</span>
                        @endif
                    </div>
                    <p class="text-sm text-brand-grey font-medium mt-1">{{ $restaurant['description'] }}</p>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs font-semibold text-brand-dark">
                        <span class="inline-flex items-center gap-1">
                            <svg class="w-3.5 h-3.5 text-brand-orange" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z"/></svg>
                            {{ number_format($restaurant['rating'], 1) }}
                        </span>
                        <span>{{ $restaurant['cuisine'] }}</span>
                        <span class="inline-flex items-center gap-1">
                            <svg class="w-3.5 h-3.5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 3"/></svg>
                            {{ $restaurant['deliveryTime'] }}
                        </span>
                        <span>Delivery {{ $restaurant['deliveryFee'] > 0 ? 'SAR ' . number_format($restaurant['deliveryFee'], 2) : 'Free' }}</span>
                        <span class="text-brand-grey font-medium">{{ $restaurant['address'] }} · {{ $restaurant['hours'] }}</span>
                    </div>
                </div>
            </div>

            {{-- Menu --}}
            <div class="mt-10 space-y-10">
                @foreach ($menu as $category)
                    <div>
                        <h2 class="text-lg font-black text-brand-black tracking-tight">{{ $category['name'] }}</h2>
                        <div class="h-px bg-brand-border my-4"></div>
                        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            @foreach ($category['items'] as $item)
                                <div class="bg-white border border-brand-border rounded-2xl p-5 flex flex-col">
                                    <p class="text-sm font-black text-brand-black">{{ $item['name'] }}</p>
                                    <p class="text-xs text-brand-grey font-medium mt-1.5 leading-relaxed flex-1">{{ $item['description'] }}</p>
                                    <div class="flex items-center justify-between mt-4">
                                        <span class="text-sm font-black text-brand-orange">SAR {{ number_format($item['price'], 2) }}</span>
                                        <template x-if="!cart['{{ $item['id'] }}']">
                                            <button @click="add('{{ $item['id'] }}', '{{ $item['name'] }}', {{ $item['price'] }})"
                                                    class="inline-flex items-center gap-1 bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-black px-4 py-2 rounded-xl transition-colors shadow-md shadow-brand-orange/25 cursor-pointer">
                                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14"/></svg>
                                                Add
                                            </button>
                                        </template>
                                        <template x-if="cart['{{ $item['id'] }}']">
                                            <div class="inline-flex items-center gap-2.5">
                                                <button @click="dec('{{ $item['id'] }}')" aria-label="Remove one"
                                                        class="w-7 h-7 rounded-lg border border-brand-border text-brand-dark font-black hover:border-brand-orange hover:text-brand-orange transition-colors cursor-pointer">−</button>
                                                <span class="text-sm font-black text-brand-black w-4 text-center" x-text="cart['{{ $item['id'] }}'].qty"></span>
                                                <button @click="add('{{ $item['id'] }}', '{{ $item['name'] }}', {{ $item['price'] }})" aria-label="Add one"
                                                        class="w-7 h-7 rounded-lg bg-brand-orange text-white font-black hover:bg-brand-orange/90 transition-colors cursor-pointer">+</button>
                                            </div>
                                        </template>
                                    </div>
                                </div>
                            @endforeach
                        </div>
                    </div>
                @endforeach
            </div>
        </div>
    </section>

    {{-- Floating cart button --}}
    <button x-show="count() > 0" x-transition.opacity @click="drawer = true"
            class="fixed bottom-6 right-6 z-40 inline-flex items-center gap-3 bg-brand-black text-white pl-5 pr-6 py-4 rounded-2xl shadow-2xl hover:bg-brand-dark transition-colors cursor-pointer"
            style="display: none;">
        <span class="relative">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            <span class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-brand-orange text-[10px] font-black flex items-center justify-center" x-text="count()"></span>
        </span>
        <span class="text-sm font-black" x-text="fmt(subtotal())"></span>
        <span class="text-xs text-white/50">View cart</span>
    </button>

    {{-- Cart drawer --}}
    <div x-show="drawer" x-transition.opacity.duration.200ms
         @click="drawer = false" class="fixed inset-0 bg-black/30 z-40" style="display: none;"></div>

    <aside x-show="drawer"
           x-transition:enter="transition ease-out duration-200"
           x-transition:enter-start="translate-x-full" x-transition:enter-end="translate-x-0"
           x-transition:leave="transition ease-in duration-200"
           x-transition:leave-start="translate-x-0" x-transition:leave-end="translate-x-full"
           class="fixed top-0 right-0 h-full w-full sm:w-96 bg-white z-50 flex flex-col shadow-2xl"
           style="display: none;">
        <div class="flex items-center justify-between px-6 py-5 border-b border-brand-border">
            <p class="text-base font-black text-brand-black">Your order</p>
            <button @click="drawer = false" aria-label="Close cart"
                    class="w-9 h-9 rounded-xl border border-brand-border flex items-center justify-center text-brand-grey hover:text-brand-orange hover:border-brand-orange/30 transition-colors cursor-pointer">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-4">
            <template x-if="count() === 0">
                <p class="text-sm text-brand-grey font-medium py-10 text-center">Your cart is empty.<br>Add a dish from the menu to try the demo.</p>
            </template>
            <template x-for="(line, id) in cart" :key="id">
                <div class="flex items-center gap-3 py-3.5 border-b border-brand-border last:border-0">
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-bold text-brand-black truncate" x-text="line.name"></p>
                        <p class="text-xs text-brand-grey font-medium" x-text="fmt(line.price) + ' each'"></p>
                    </div>
                    <div class="inline-flex items-center gap-2.5">
                        <button @click="dec(id)" aria-label="Remove one"
                                class="w-7 h-7 rounded-lg border border-brand-border text-brand-dark font-black hover:border-brand-orange hover:text-brand-orange transition-colors cursor-pointer">−</button>
                        <span class="text-sm font-black text-brand-black w-4 text-center" x-text="line.qty"></span>
                        <button @click="add(id, line.name, line.price)" aria-label="Add one"
                                class="w-7 h-7 rounded-lg bg-brand-orange text-white font-black hover:bg-brand-orange/90 transition-colors cursor-pointer">+</button>
                    </div>
                    <p class="text-sm font-black text-brand-black w-20 text-right" x-text="fmt(line.qty * line.price)"></p>
                </div>
            </template>
        </div>

        <div class="border-t border-brand-border px-6 py-5 space-y-2">
            <p x-show="subtotal() > 0 && subtotal() < {{ $restaurant['minOrder'] }}"
               class="text-xs font-semibold text-brand-orange"
               x-text="'Minimum order SAR ' + {{ $restaurant['minOrder'] }}.toFixed(2) + ' — add SAR ' + ({{ $restaurant['minOrder'] }} - subtotal()).toFixed(2) + ' more'"></p>
            <div class="flex justify-between text-sm font-medium text-brand-grey"><span>Subtotal</span><span x-text="fmt(subtotal())"></span></div>
            <div class="flex justify-between text-sm font-medium text-brand-grey"><span>Delivery fee</span><span x-text="fmt(fee())"></span></div>
            <div class="flex justify-between text-base font-black text-brand-black pt-1"><span>Total</span><span x-text="fmt(total())"></span></div>
            <button @click="checkout()"
                    class="w-full mt-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-black text-sm py-4 rounded-2xl transition-colors shadow-md shadow-brand-orange/25 disabled:opacity-40 cursor-pointer"
                    :disabled="subtotal() < {{ $restaurant['minOrder'] }}">
                Checkout
            </button>
            <p class="text-[11px] text-brand-grey font-medium text-center pt-1">Demo only — no order is placed and no payment is taken.</p>
        </div>
    </aside>

    {{-- Checkout demo notice --}}
    <div x-show="notice" x-transition.opacity.duration.200ms
         class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-black text-white text-sm font-bold px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3"
         style="display: none;">
        <svg class="w-4 h-4 text-brand-orange shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 2v6.5L4.5 18a2 2 0 001.8 3h11.4a2 2 0 001.8-3L14 8.5V2M8.5 2h7"/>
        </svg>
        <span>Checkout is disabled in the demo — a real customer app would pay here via STC Pay.</span>
    </div>
</div>
@endsection
