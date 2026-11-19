@extends('layouts.site')

@section('title', 'Customer Service — Alabiq')

@section('content')
    @php
        $channels = [
            [
                'key' => 'whatsapp',
                'title' => 'WhatsApp us',
                'eyebrow' => 'Fastest reply',
                'value' => '+966 56 176 6883',
                'hint' => 'Chat with a real person. Most questions are answered within a few minutes.',
                'cta' => 'Start a chat',
                'href' => 'https://wa.me/966561766883',
                'icon' => 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
                'featured' => true,
            ],
            [
                'key' => 'email',
                'title' => 'Email us',
                'eyebrow' => 'Written record',
                'value' => 'customerservice@alabiq.com',
                'hint' => 'Best for receipts, refunds, and anything you want in writing.',
                'cta' => 'Send an email',
                'href' => 'mailto:customerservice@alabiq.com?subject=Customer%20service',
                'icon' => 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
                'featured' => false,
            ],
            [
                'key' => 'phone',
                'title' => 'Call us',
                'eyebrow' => 'Talk it through',
                'value' => '+966 56 176 6883',
                'hint' => 'Daily, 7 AM – midnight.',
                'cta' => 'Call now',
                'href' => 'tel:+966561766883',
                'icon' => 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
                'featured' => false,
            ],
        ];
        $topics = ['Food order', 'Shop order', 'Airport ride', 'Payment', 'Account', 'Other'];
    @endphp

    <section class="w-full bg-brand-light px-6 md:px-20 py-16">
        <div class="max-w-5xl mx-auto">
            <div class="text-center max-w-2xl mx-auto mb-12">
                <span class="text-brand-orange text-sm font-bold tracking-widest uppercase">Customer Service</span>
                <h1 class="text-3xl md:text-5xl font-black tracking-tight text-brand-black mt-2 leading-tight">
                    We are here to <span class="text-brand-orange">help.</span>
                </h1>
                <p class="text-brand-grey text-sm md:text-base mt-4 font-medium leading-relaxed">
                    Questions about an order, a payment, or your account? Reach us on the
                    channel you like — every message reaches a real person on our team.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-14">
                @foreach ($channels as $c)
                    <div class="relative flex flex-col rounded-3xl p-5 border {{ $c['featured'] ? 'bg-brand-black text-white border-transparent shadow-lg shadow-brand-orange/20' : 'bg-white text-brand-black border-brand-border shadow-sm' }}">
                        <div class="flex items-start justify-between gap-3">
                            <span class="w-12 h-12 rounded-2xl flex items-center justify-center {{ $c['featured'] ? 'bg-[#25D366]' : 'bg-gradient-to-br from-brand-orange to-brand-red' }}">
                                <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="{{ $c['icon'] }}"/>
                                </svg>
                            </span>
                            <span class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full {{ $c['featured'] ? 'bg-white/10 text-white/75' : 'bg-brand-warm text-brand-orange' }}">
                                {{ $c['eyebrow'] }}
                            </span>
                        </div>

                        <h3 class="text-lg font-black tracking-tight mt-4">{{ $c['title'] }}</h3>
                        <a href="{{ $c['href'] }}" target="_blank" rel="noreferrer"
                           class="mt-0.5 text-sm font-bold text-brand-orange break-all hover:underline">{{ $c['value'] }}</a>
                        <p class="text-xs mt-2 leading-relaxed {{ $c['featured'] ? 'text-white/60' : 'text-brand-grey' }} flex-1">{{ $c['hint'] }}</p>

                        <a href="{{ $c['href'] }}" target="_blank" rel="noreferrer"
                           class="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors {{ $c['featured'] ? 'bg-brand-orange text-white hover:bg-brand-orange/90' : 'bg-brand-warm text-brand-orange border border-brand-orange/15 hover:bg-brand-orange hover:text-white' }}">
                            {{ $c['cta'] }}
                        </a>
                    </div>
                @endforeach
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                <div class="bg-white border border-brand-border rounded-3xl p-6 md:p-8 shadow-sm">
                    <h2 class="text-xl font-black text-brand-black tracking-tight">Write to us</h2>
                    <p class="text-sm text-brand-grey mt-1 mb-6">
                        Fill this in and your mail app will open with the message addressed to
                        <span class="font-bold text-brand-orange">customerservice@alabiq.com</span>.
                    </p>

                    <form x-data="{
                            name: '', reply: '', topic: '{{ $topics[0] }}', message: '',
                            submit() {
                                const subject = encodeURIComponent('[' + this.topic + '] ' + this.name);
                                const body = encodeURIComponent('Name: ' + this.name + '\nReply to: ' + this.reply + '\nTopic: ' + this.topic + '\n\n' + this.message);
                                window.location.href = 'mailto:customerservice@alabiq.com?subject=' + subject + '&body=' + body;
                            }
                        }"
                        @submit.prevent="submit()" class="space-y-4">

                        <div class="grid sm:grid-cols-2 gap-4">
                            <label class="block">
                                <span class="text-xs font-bold text-brand-dark">Your name</span>
                                <input type="text" x-model="name" required placeholder="Full name"
                                       class="mt-1.5 w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-brand-dark text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                            </label>
                            <label class="block">
                                <span class="text-xs font-bold text-brand-dark">Your email</span>
                                <input type="email" x-model="reply" required placeholder="you@example.com"
                                       class="mt-1.5 w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-brand-dark text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                            </label>
                        </div>

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Topic</span>
                            <select x-model="topic"
                                    class="mt-1.5 w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-brand-dark text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                                @foreach ($topics as $topic)
                                    <option value="{{ $topic }}">{{ $topic }}</option>
                                @endforeach
                            </select>
                        </label>

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Message</span>
                            <textarea x-model="message" required rows="5" placeholder="How can we help?"
                                      class="mt-1.5 w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-brand-dark text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15"></textarea>
                        </label>

                        <button type="submit"
                                class="w-full bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-colors shadow-md shadow-brand-orange/25">
                            Open email app
                        </button>
                    </form>
                </div>

                <div class="space-y-4">
                    <div class="bg-white border border-brand-border rounded-3xl p-6 shadow-sm">
                        <h3 class="text-base font-black text-brand-black">Visit us</h3>
                        <p class="text-sm text-brand-grey mt-2 leading-relaxed">
                            Airport Road, Qurtubah, Riyadh 13244<br>
                            Business Gate, Riyadh, K.S.A
                        </p>
                    </div>
                    <div class="bg-white border border-brand-border rounded-3xl p-6 shadow-sm">
                        <h3 class="text-base font-black text-brand-black">Working hours</h3>
                        <p class="text-sm text-brand-grey mt-2 leading-relaxed">Daily, 7 AM – midnight</p>
                    </div>
                    <div class="bg-brand-warm border border-brand-orange/20 rounded-3xl p-6">
                        <h3 class="text-base font-black text-brand-black">Quick answers</h3>
                        <p class="text-sm text-brand-grey mt-2 leading-relaxed">
                            Many questions — tracking, payments, cancellations, account deletion —
                            are answered in the
                            <a href="/help-center" class="font-bold text-brand-orange hover:underline">help center</a>
                            and the
                            <a href="/#faq" class="font-bold text-brand-orange hover:underline">FAQ</a>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </section>
@endsection
