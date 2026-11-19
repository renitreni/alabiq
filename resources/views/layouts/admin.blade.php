<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>@yield('title', 'Admin') — Alabiq Control Center</title>
    <link rel="icon" type="image/png" href="/favicon.png">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen">

    @php
        $nav = [
            ['overview', 'Overview', '/admin', 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'],
            ['bookings', 'Bookings', '/admin/bookings', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'],
            ['drivers', 'Drivers', '/admin/drivers', 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M13 7a4 4 0 11-8 0 4 4 0 018 0z'],
            ['restaurant', 'Restaurant Orders', '/admin/restaurant-orders', 'M6 13.87A4 4 0 0110.41 10a4 4 0 015.92-2.33M8 21v-4a4 4 0 014-4 4 4 0 014 4v4M12 2a9 9 0 00-9 9 9 9 0 0018 0 9 9 0 00-9-9z'],
            ['food', 'Food', '/admin/food', 'M3 2v7c0 1.1.9 2 2 2h2a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7'],
            ['shop', 'Shop', '/admin/shop', 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'],
            ['reports', 'Reports', '/admin/reports', 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'],
            ['errors', 'Errors', '/admin/errors', 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'],
            ['admins', 'Admins', '/admin/admins', 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'],
            ['accounts', 'Accounts', '/admin/accounts', 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11a2 2 0 100-4 2 2 0 000 4zm0 0c-1.306 0-2.417.835-2.83 2M15 14a3.001 3.001 0 012.83 2'],
            ['integrations', 'Integrations', '/admin/integrations', 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'],
            ['settings', 'Settings', '/admin/settings', 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'],
        ];
        $pageCopy = [
            'overview' => ['Dashboard', 'Monitor bookings, payments, and drivers at a glance.'],
            'bookings' => ['Bookings', 'Review payment proofs and manage ride requests.'],
            'drivers' => ['Drivers', 'Approve new drivers and manage fleet access.'],
            'restaurant' => ['Restaurant Orders', 'Live orders per restaurant, and who has not started cooking yet.'],
            'food' => ['Food Delivery', 'Merchants, credit limits, order payments, and riders.'],
            'shop' => ['Ecommerce', 'Stores, catalogue and markup, orders, inventory and settlement.'],
            'reports' => ['Reports', 'Bookings and revenue over time — export to CSV.'],
            'errors' => ['Errors', 'Backend errors, who hit them, and when.'],
            'admins' => ['Admins', 'Who has the portal, and who has been signing in.'],
            'accounts' => ['Accounts', 'All user accounts — passengers, drivers, merchants, and admins.'],
            'integrations' => ['Integrations', 'Partner API credentials, webhook endpoints, and delivery webhooks.'],
            'settings' => ['Settings', 'Platform-wide rules that apply without a deploy.'],
        ];
        $active = $activeNav ?? 'overview';
        $copy = $pageCopy[$active] ?? $pageCopy['overview'];
        $user = auth()->guard('web')->user();
    @endphp

    <div class="min-h-screen flex bg-[#0b0f16]" x-data="{ mobileNav: false }">

        {{-- Sidebar --}}
        <aside class="hidden md:flex w-[76px] lg:w-[260px] shrink-0 flex-col border-r border-white/5">
            <div class="h-16 lg:h-[72px] px-3 lg:px-5 flex items-center">
                <a href="/admin" class="flex items-center gap-3 min-w-0 group justify-center lg:justify-start px-2 lg:px-0">
                    <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/15 transition-colors">
                        <img src="/alabiq-icon.png" alt="" class="w-7 h-7 object-contain">
                    </div>
                    <div class="min-w-0 hidden lg:block">
                        <div class="font-black text-white text-sm tracking-tight leading-none">
                            ALA<span class="text-brand-orange">BIQ</span>
                        </div>
                        <div class="text-[10px] font-semibold text-white/40 uppercase tracking-[0.14em] mt-1">
                            Control center
                        </div>
                    </div>
                </a>
            </div>

            <div class="px-2 lg:px-4 mb-2 flex-1 overflow-y-auto">
                <p class="hidden lg:block px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30 mb-2">Menu</p>
                <nav class="space-y-1">
                    @foreach ($nav as [$id, $label, $href, $icon])
                        <a href="{{ $href }}" title="{{ $label }}"
                           class="w-full flex items-center justify-center lg:justify-start gap-3 rounded-2xl text-left transition-all px-0 py-2.5 lg:px-3 lg:py-2.5 {{ $active === $id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5' }}">
                            <span class="flex items-center justify-center w-10 h-10 lg:w-9 lg:h-9 rounded-xl shrink-0 {{ $active === $id ? 'bg-gradient-to-br from-brand-orange to-brand-red text-white shadow-md shadow-brand-orange/30' : 'bg-white/5 text-white/70' }}">
                                <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/>
                                </svg>
                            </span>
                            <span class="hidden lg:inline text-sm font-semibold tracking-tight">{{ $label }}</span>
                            @if ($active === $id)
                                <span class="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0"></span>
                            @endif
                        </a>
                    @endforeach
                </nav>
            </div>

            <div class="p-2 lg:p-4 flex-shrink-0">
                <div class="rounded-2xl bg-white/[0.08] border border-white/10 p-2 lg:p-3 min-h-[80px] lg:min-h-[100px]">
                    <div class="flex items-center justify-center lg:justify-start gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-orange to-brand-red text-white flex items-center justify-center font-black text-sm shrink-0">
                            {{ strtoupper(substr($user->email ?? 'A', 0, 1)) }}
                        </div>
                        <div class="min-w-0 flex-1 hidden lg:block">
                            <div class="text-xs font-semibold text-white truncate">{{ $user->email }}</div>
                            <div class="text-[10px] text-white/45 font-medium mt-0.5">Administrator</div>
                        </div>
                    </div>
                    <form method="POST" action="/logout" class="mt-2 lg:mt-3">
                        @csrf
                        <button type="submit" title="Sign out"
                                class="w-full flex items-center justify-center gap-2 text-xs font-semibold text-white/60 hover:text-white py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                            </svg>
                            <span class="hidden lg:inline">Sign out</span>
                        </button>
                    </form>
                </div>
            </div>
        </aside>

        <div class="flex-1 flex flex-col min-w-0 bg-[#0b0f16] relative">
            {{-- Faint brand glow behind the content, echoes the login backdrop --}}
            <div class="absolute inset-x-0 top-0 h-[420px] pointer-events-none" aria-hidden="true">
                <div class="absolute -top-24 right-0 w-[420px] h-[420px] rounded-full bg-brand-orange/[0.07] blur-[120px]"></div>
                <div class="absolute -top-16 left-1/4 w-[360px] h-[360px] rounded-full bg-brand-red/[0.05] blur-[110px]"></div>
            </div>

            <header class="sticky top-0 z-30 bg-[#0b0f16]/85 backdrop-blur-xl border-b border-white/5">
                <div class="min-h-16 lg:min-h-[72px] px-3 sm:px-5 md:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <button type="button" @click="mobileNav = true"
                                class="md:hidden p-2.5 rounded-xl bg-white/10 border border-white/10 shadow-sm cursor-pointer"
                                aria-label="Open menu">
                            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
                            </svg>
                        </button>
                        <div class="min-w-0">
                            <h1 class="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight truncate">
                                {{ $copy[0] }}
                            </h1>
                            <p class="hidden sm:block text-xs sm:text-sm text-white/40 truncate">{{ $copy[1] }}</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <a href="/" target="_blank"
                           class="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-white/60 bg-white/[0.06] border border-white/10 px-3 py-2.5 rounded-xl hover:border-brand-orange/40 hover:text-brand-orange transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                            </svg>
                            <span class="hidden md:inline">View site</span>
                        </a>
                    </div>
                </div>
            </header>

            @if (session('status'))
                <div class="px-3 sm:px-5 md:px-6 lg:px-8 pt-4">
                    <div class="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-700">
                        {{ session('status') }}
                    </div>
                </div>
            @endif

            <main class="relative flex-1 px-3 sm:px-5 md:px-6 lg:px-8 py-5 md:py-7 w-full max-w-[1400px] pb-[max(2rem,env(safe-area-inset-bottom))]">
                @yield('content')
            </main>
        </div>

        {{-- Mobile drawer --}}
        <div x-show="mobileNav" x-cloak class="fixed inset-0 z-50 md:hidden">
            <button type="button" @click="mobileNav = false"
                    class="absolute inset-0 bg-black/50 cursor-pointer backdrop-blur-sm w-full"
                    aria-label="Close menu"></button>
            <div x-show="mobileNav" x-transition:enter="transition ease-out duration-200"
                 x-transition:enter-start="-translate-x-5 opacity-60" x-transition:enter-end="translate-x-0 opacity-100"
                 class="absolute left-0 top-0 bottom-0 w-[min(20rem,86vw)] bg-[#0c1018] shadow-2xl flex flex-col">
                <div class="h-16 px-4 flex items-center justify-between border-b border-white/5">
                    <div class="flex items-center gap-3">
                        <img src="/alabiq-icon.png" alt="" class="w-8 h-8 object-contain">
                        <div class="font-black text-white text-sm">ALA<span class="text-brand-orange">BIQ</span></div>
                    </div>
                    <button type="button" @click="mobileNav = false" class="p-2 rounded-lg hover:bg-white/5 text-white/70" aria-label="Close menu">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
                    @foreach ($nav as [$id, $label, $href, $icon])
                        <a href="{{ $href }}"
                           class="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left {{ $active === $id ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white hover:bg-white/5' }}">
                            <span class="flex items-center justify-center w-9 h-9 rounded-xl {{ $active === $id ? 'bg-gradient-to-br from-brand-orange to-brand-red text-white' : 'bg-white/5' }}">
                                <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="{{ $icon }}"/>
                                </svg>
                            </span>
                            <span class="text-sm font-semibold">{{ $label }}</span>
                        </a>
                    @endforeach
                </nav>
                <div class="p-4 border-t border-white/5">
                    <div class="text-xs text-white/45 truncate mb-3">{{ $user->email }}</div>
                    <form method="POST" action="/logout">
                        @csrf
                        <button type="submit" class="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white/70 py-2.5 rounded-xl border border-white/10 cursor-pointer">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                            </svg>
                            Sign out
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>

</body>
</html>
