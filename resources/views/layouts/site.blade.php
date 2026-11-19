<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>@yield('title', 'Alabiq — Food delivery across Riyadh')</title>
    <meta name="description" content="@yield('meta', 'Alabiq brings Riyadh\'s best kitchens to your doorstep. Order from verified partner restaurants, pay securely with STC Pay, and track your order on live GPS.')">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-brand-light text-brand-dark pt-20">

    {{-- Navbar (Blade port of components/Navbar.jsx — same links, Alpine
         replaces framer-motion for the mobile drawer and scroll state) --}}
    <nav x-data="{ open: false, scrolled: false }"
         x-init="window.addEventListener('scroll', () => scrolled = window.scrollY > 10)"
         x-bind:class="scrolled ? 'bg-white/95 shadow-[0_8px_32px_rgba(249,115,22,0.10),0_2px_8px_rgba(0,0,0,0.06)]' : 'bg-white/80 shadow-[0_2px_4px_rgba(0,0,0,0.04)]'"
         class="w-full h-20 border-b border-brand-border px-6 md:px-20 flex items-center justify-between fixed top-0 left-0 z-50 transition-all duration-300">

        <a href="/" class="flex items-center gap-2.5 shrink-0" aria-label="Alabiq home">
            <img src="/alabiq-icon.png" alt="" aria-hidden="true" class="w-10 h-10 object-contain">
            <span class="text-lg font-black tracking-tight whitespace-nowrap text-brand-black">
                ALA<span class="text-brand-orange">BIQ</span>
            </span>
        </a>

        <div class="hidden 2xl:flex items-center gap-1 ml-auto mr-0">
            @php
                $menuLinks = [
                    ['Home', '/'],
                    ['Services', '/services'],
                    ['How It Works', '/#how-it-works'],
                    ['About', '/#about'],
                    ['FAQ', '/#faq'],
                    ['Support', '/support'],
                ];
                $path = request()->path();
            @endphp
            <ul class="flex items-center gap-0.5 text-sm font-semibold">
                @foreach ($menuLinks as [$name, $to])
                    <li>
                        <a href="{{ $to }}"
                           class="relative flex items-center whitespace-nowrap px-2.5 py-2 rounded-full transition-colors duration-150 {{ $to === '/' . $path || ($to === '/' && $path === '/') ? 'text-brand-orange' : 'text-brand-grey hover:text-brand-orange' }}">
                            <span class="relative z-10">{{ $name }}</span>
                        </a>
                    </li>
                @endforeach
            </ul>

            <span class="w-px h-6 bg-brand-border mx-2" aria-hidden="true"></span>

            <a href="/services/food" title="Browse marketplace" aria-label="Browse marketplace"
               class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-orange/10 text-brand-orange hover:bg-brand-orange hover:text-white transition-colors shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
            </a>

            <div class="flex items-center gap-2 shrink-0 ml-2">
                <a href="/login" class="whitespace-nowrap text-sm font-bold px-3 py-2 rounded-full text-brand-dark hover:text-brand-orange transition-colors">Log in</a>
                <a href="/services/food">
                    <span class="inline-block whitespace-nowrap bg-brand-orange text-white text-xs font-black px-5 py-3 rounded-full cursor-pointer shadow-md shadow-brand-orange/25 hover:shadow-xl hover:shadow-brand-orange/30 transition-shadow duration-300">
                        Order Now
                    </span>
                </a>
                <a href="/signup" class="whitespace-nowrap text-sm font-bold px-3 py-2 rounded-full text-brand-grey hover:text-brand-orange transition-colors">Sign up</a>
            </div>
        </div>

        <div class="flex items-center gap-1 2xl:hidden">
            <button @click="open = !open" aria-label="Toggle menu"
                    class="block focus:outline-none z-50 cursor-pointer p-2 rounded-xl hover:bg-orange-50 transition-colors">
                <div class="w-6 h-[18px] flex flex-col justify-between">
                    <span class="block h-0.5 w-full bg-brand-dark rounded-full transition-transform duration-200"
                          x-bind:class="open ? 'rotate-45 translate-y-[8px]' : ''"></span>
                    <span class="block h-0.5 w-full bg-brand-dark rounded-full transition-opacity duration-200"
                          x-bind:class="open ? 'opacity-0' : ''"></span>
                    <span class="block h-0.5 w-full bg-brand-dark rounded-full transition-transform duration-200"
                          x-bind:class="open ? '-rotate-45 -translate-y-[8px]' : ''"></span>
                </div>
            </button>
        </div>

        {{-- Mobile drawer --}}
        <div x-show="open" x-transition.opacity.duration.200ms
             @click="open = false"
             class="fixed inset-0 bg-black/30 z-40 2xl:hidden" style="display: none;"></div>

        <div x-show="open" x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="translate-x-full" x-transition:enter-end="translate-x-0"
             x-transition:leave="transition ease-in duration-200"
             x-transition:leave-start="translate-x-0" x-transition:leave-end="translate-x-full"
             class="fixed top-0 right-0 h-full w-72 bg-white rounded-l-3xl z-50 2xl:hidden flex flex-col justify-between shadow-2xl overflow-hidden"
             style="display: none;">
            <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-orange/50 to-brand-orange rounded-tl-3xl"></div>

            <div class="pt-28 px-6">
                <ul class="flex flex-col gap-0.5">
                    @foreach ($menuLinks as [$name, $to])
                        <li>
                            <a href="{{ $to }}" @click="open = false"
                               class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:text-brand-orange hover:bg-orange-50 transition-all duration-150 font-semibold text-base group {{ $to === '/' . $path ? 'text-brand-orange bg-orange-50' : 'text-brand-grey' }}">
                                <span class="ml-auto text-brand-orange text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150">→</span>
                                <span>{{ $name }}</span>
                            </a>
                        </li>
                    @endforeach
                </ul>
            </div>

            <div class="p-6">
                <div class="flex flex-col gap-2">
                    <a href="/login" class="block text-center w-full font-black py-3 rounded-2xl text-sm text-brand-dark border border-brand-border">Log in</a>
                    <a href="/services/food" class="block text-center w-full bg-brand-orange text-white font-black py-4 rounded-2xl text-sm shadow-lg shadow-brand-orange/25">Order Now</a>
                    <a href="/signup" class="block text-center w-full font-black py-3 rounded-2xl text-sm text-brand-grey border border-brand-border">Sign up</a>
                </div>
            </div>
        </div>
    </nav>

    <main>
        @yield('content')
    </main>

    {{-- Footer (Blade port of sections/Footer.jsx) --}}
    @php
        $company = [
            'websiteDisplay' => 'www.alabiq.com',
            'websiteUrl' => 'https://www.alabiq.com',
            'email' => 'customerservice@alabiq.com',
            'phoneDisplay' => '+966 56 176 6883',
            'phoneTel' => '+966561766883',
            'whatsappDisplay' => '+966 56 176 6883',
            'whatsappUrl' => 'https://wa.me/966561766883',
            'addressLine1' => 'Airport Road, Qurtubah, Riyadh 13244',
            'addressLine2' => 'Business Gate, Riyadh, K.S.A',
            'hours' => 'Daily, 7 AM - midnight',
        ];
        $legalLinks = [
            ['Privacy Policy', '/privacy-policy'],
            ['Terms of Service', '/terms-of-service'],
            ['Cookie Preferences', '/cookie-preferences'],
        ];
        $exploreLinks = [
            ['Our Services', '/services'],
            ['Food Delivery', '/services/food'],
            ['How It Works', '/#how-it-works'],
        ];
        $companyLinks = [
            ['About Us', '/#about'],
            ['FAQ', '/#faq'],
            ['Customer Service', '/support'],
        ];
        $socialLinks = [
            ['Facebook', 'https://www.facebook.com/profile.php?id=61591451831938', 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'],
            ['LinkedIn', 'https://www.linkedin.com/in/alabiq-9034a2420', 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'],
            ['Instagram', 'https://www.instagram.com/alabiqofficial/', 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'],
            ['TikTok', 'https://vt.tiktok.com/ZSCndScjW/', 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'],
        ];
    @endphp

    <footer class="relative w-full bg-brand-black text-white overflow-hidden">
        <div class="h-1 w-full bg-gradient-to-r from-brand-orange via-orange-400 to-brand-red"></div>

        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div class="absolute -top-40 right-0 w-[500px] h-[500px] rounded-full bg-brand-orange/8 blur-[120px]"></div>
            <div class="absolute bottom-0 -left-32 w-[400px] h-[400px] rounded-full bg-brand-red/6 blur-[100px]"></div>
        </div>

        <div class="relative z-10 max-w-7xl mx-auto px-6 md:px-8 pt-14 pb-10">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12">
                <div class="lg:col-span-2 flex flex-col gap-5">
                    <a href="/" class="flex items-center gap-3 group w-fit">
                        <img src="/alabiq-icon.png" alt="Alabiq Logo" class="w-12 h-12 object-contain">
                        <span class="text-lg font-black tracking-tight text-white">
                            ALA<span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">BIQ</span>
                        </span>
                    </a>

                    <p class="text-sm leading-relaxed max-w-xs text-white/50">
                        Riyadh's best restaurants delivered to your door — with real-time
                        tracking on every order.
                    </p>

                    <div class="flex gap-2 mt-1">
                        @foreach ($socialLinks as [$label, $href, $path])
                            <a href="{{ $href }}" aria-label="{{ $label }}" target="_blank" rel="noopener noreferrer"
                               class="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 text-white/45 hover:text-white hover:bg-gradient-to-br hover:from-brand-orange hover:to-brand-red transition-all duration-300">
                                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="{{ $path }}"/></svg>
                            </a>
                        @endforeach
                    </div>
                </div>

                <div>
                    <h4 class="text-xs font-bold uppercase tracking-widest mb-5 text-brand-orange">Explore</h4>
                    <ul class="flex flex-col gap-3.5">
                        @foreach ($exploreLinks as [$label, $href])
                            <li><a href="{{ $href }}" class="text-sm text-white/55 hover:text-brand-orange transition-colors duration-200">{{ $label }}</a></li>
                        @endforeach
                    </ul>
                </div>

                <div>
                    <h4 class="text-xs font-bold uppercase tracking-widest mb-5 text-brand-orange">Company</h4>
                    <ul class="flex flex-col gap-3.5">
                        @foreach ($companyLinks as [$label, $href])
                            <li><a href="{{ $href }}" class="text-sm text-white/55 hover:text-brand-orange transition-colors duration-200">{{ $label }}</a></li>
                        @endforeach
                    </ul>
                </div>

                <div>
                    <h4 class="text-xs font-bold uppercase tracking-widest mb-5 text-brand-orange">Contact</h4>
                    <ul class="flex flex-col gap-4 text-sm text-white/55">
                        <li>{{ $company['addressLine1'] }}<br>{{ $company['addressLine2'] }}</li>
                        <li><a href="mailto:{{ $company['email'] }}" class="hover:text-brand-orange transition-colors">{{ $company['email'] }}</a></li>
                        <li><a href="tel:{{ $company['phoneTel'] }}" class="hover:text-brand-orange transition-colors">{{ $company['phoneDisplay'] }}</a></li>
                        <li><a href="{{ $company['whatsappUrl'] }}" target="_blank" rel="noreferrer" class="hover:text-brand-orange transition-colors">WhatsApp {{ $company['whatsappDisplay'] }}</a></li>
                        <li><a href="{{ $company['websiteUrl'] }}" target="_blank" rel="noreferrer" class="hover:text-brand-orange transition-colors">{{ $company['websiteDisplay'] }}</a></li>
                        <li>{{ $company['hours'] }}</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="relative z-10 border-t border-white/8">
            <div class="max-w-7xl mx-auto px-6 md:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
                <p class="text-xs text-white/35">
                    © {{ date('Y') }}
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red font-semibold">Alabiq</span>.
                    All rights reserved.
                </p>
                <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                    @foreach ($legalLinks as [$label, $href])
                        <a href="{{ $href }}" class="text-xs text-white/35 hover:text-white/70 transition-colors duration-200">{{ $label }}</a>
                    @endforeach
                </div>
            </div>
        </div>
    </footer>

</body>
</html>
