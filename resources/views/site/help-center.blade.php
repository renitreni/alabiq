@extends('layouts.site')

@section('title', 'Help Center — Alabiq')

@section('content')
    @php
        $faqs = [
            ['How do I book an airport transfer?', 'Sign in, open Book, choose whether you are heading to or from the airport, pick your district and terminal, then confirm. The fare is fixed and shown before you confirm.'],
            ['How do I pay?', 'Pay with a saved card or through the in-app payment options. Your booking or order is confirmed once the payment goes through.'],
            ['Can I track my driver?', 'Yes. Once a driver is assigned, the tracking screen shows their position on the live map along with an estimated arrival time.'],
            ['How do I cancel or get a refund?', 'Message us on WhatsApp or email customerservice@alabiq.com with your booking or order code. Cancellations follow our published guidelines and Saudi consumer protection rules.'],
            ['How do I delete my account?', 'Open Profile and use Delete Account at the bottom of the screen. If you have already uninstalled the app, see the account deletion page.'],
        ];
    @endphp

    <section class="w-full bg-brand-light px-6 md:px-20 py-16" x-data="{ open: null }">
        <div class="max-w-3xl mx-auto">
            <div class="text-center mb-12">
                <span class="text-brand-orange text-sm font-bold tracking-widest uppercase">Help Center</span>
                <h1 class="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
                    How can we <span class="text-brand-orange">help?</span>
                </h1>
                <p class="text-brand-grey text-sm md:text-base mt-4 font-medium max-w-xl mx-auto">
                    Quick answers to the questions we hear most. Still stuck? Our team replies
                    on WhatsApp within minutes.
                </p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
                <a href="https://wa.me/966561766883" target="_blank" rel="noreferrer"
                   class="flex items-center gap-3 p-5 rounded-3xl bg-brand-black text-white border border-transparent shadow-lg shadow-brand-orange/20 hover:opacity-95 transition-opacity">
                    <span class="w-11 h-11 rounded-2xl bg-[#25D366] flex items-center justify-center shrink-0">
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
                        </svg>
                    </span>
                    <span>
                        <span class="block text-sm font-black">WhatsApp us</span>
                        <span class="block text-xs text-white/60 mt-0.5">+966 56 176 6883 — fastest reply</span>
                    </span>
                </a>
                <a href="mailto:customerservice@alabiq.com?subject=Customer%20service"
                   class="flex items-center gap-3 p-5 rounded-3xl bg-white text-brand-black border border-brand-border shadow-sm hover:border-brand-orange/30 transition-colors">
                    <span class="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-red flex items-center justify-center shrink-0">
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                    </span>
                    <span>
                        <span class="block text-sm font-black">Email us</span>
                        <span class="block text-xs text-brand-grey mt-0.5">customerservice@alabiq.com</span>
                    </span>
                </a>
            </div>

            <div class="bg-white rounded-3xl px-6 md:px-8 border border-brand-border shadow-sm">
                @foreach ($faqs as $i => [$q, $a])
                    <div class="border-b border-brand-border last:border-0">
                        <button @click="open = open === {{ $i }} ? null : {{ $i }}"
                                :aria-expanded="open === {{ $i }}"
                                class="w-full py-5 flex items-center justify-between gap-6 text-left group">
                            <span class="text-base font-bold text-brand-black group-hover:text-brand-orange transition-colors"
                                  :class="open === {{ $i }} ? '!text-brand-orange' : ''">{{ $q }}</span>
                            <svg class="w-4 h-4 shrink-0 text-brand-grey transition-transform duration-200"
                                :class="open === {{ $i }} ? 'rotate-45 text-brand-orange' : ''"
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14"/>
                            </svg>
                        </button>
                        <div x-show="open === {{ $i }}" x-cloak
                             x-transition:enter="transition ease-out duration-200"
                             x-transition:enter-start="opacity-0 -translate-y-1"
                             x-transition:enter-end="opacity-100 translate-y-0">
                            <p class="pb-5 text-sm leading-relaxed text-brand-grey">{{ $a }}</p>
                        </div>
                    </div>
                @endforeach
            </div>

            <p class="text-center text-sm text-brand-grey mt-8 font-medium">
                Still need help?
                <a href="/support" class="font-bold text-brand-orange hover:underline">Contact customer service →</a>
            </p>
        </div>
    </section>
@endsection
