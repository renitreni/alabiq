<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Sign in — Alabiq Control Center</title>
    <link rel="icon" type="image/png" href="/favicon.png">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-[#0b0f16] flex items-center justify-center px-4 py-12 relative overflow-hidden">

    {{-- Backdrop: fine grid + brand glows --}}
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div class="absolute inset-0 opacity-[0.55]"
             style="background-image:linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px);background-size:44px 44px;"></div>
        <div class="absolute inset-0" style="background:radial-gradient(ellipse 70% 55% at 50% 42%,transparent 30%,#0b0f16 100%);"></div>
        <div class="absolute -top-40 -right-32 w-[560px] h-[560px] rounded-full bg-brand-orange/15 blur-[130px]"></div>
        <div class="absolute -bottom-48 -left-40 w-[480px] h-[480px] rounded-full bg-brand-red/10 blur-[120px]"></div>
    </div>

    <div class="relative w-full max-w-md">

        {{-- Brand lockup --}}
        <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center mb-5">
                <div class="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/10 shadow-lg shadow-black/40 backdrop-blur flex items-center justify-center">
                    <img src="/alabiq-icon.png" alt="Alabiq" class="w-10 h-10 object-contain drop-shadow">
                </div>
            </div>
            <div class="flex items-center justify-center gap-2.5">
                <h1 class="text-[26px] leading-none font-black text-white tracking-tight">
                    ALA<span class="text-brand-orange">BIQ</span>
                </h1>
                <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 bg-white/[0.07] border border-white/10 rounded-full px-2.5 py-1">Control Center</span>
            </div>
            <p class="text-sm text-white/40 mt-3">Sign in with an admin account to continue.</p>
        </div>

        {{-- Sign-in card --}}
        <div class="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50 relative">
            <div class="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand-orange/60 to-transparent"></div>

            @if ($errors->any())
                <div class="mb-5 flex items-start gap-2.5 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm font-semibold text-rose-700">
                    <svg class="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-5a1 1 0 112 0 1 1 0 01-2 0zm.2-6.2a.8.8 0 011.6 0l-.15 3.4a.65.65 0 01-1.3 0l-.15-3.4z" clip-rule="evenodd"/>
                    </svg>
                    <span>{{ $errors->first() }}</span>
                </div>
            @endif

            <form method="POST" action="/login" class="space-y-5" x-data="{ show: false }">
                @csrf

                <label class="block">
                    <span class="text-xs font-bold text-brand-dark">Email</span>
                    <div class="relative mt-1.5">
                        <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                            <svg class="w-4.5 h-4.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                <path d="M3 5.5h14v9H3z" stroke-linejoin="round"/>
                                <path d="M3.5 6l6.5 5 6.5-5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        <input type="email" name="email" value="{{ old('email') }}" required autofocus
                               autocomplete="username" placeholder="admin@alabiq.com"
                               class="w-full bg-white border @error('email') border-brand-red @else border-brand-border @enderror rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                    </div>
                </label>

                <label class="block">
                    <span class="text-xs font-bold text-brand-dark">Password</span>
                    <div class="relative mt-1.5" x-data>
                        <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                            <svg class="w-4.5 h-4.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                <rect x="4" y="8.5" width="12" height="7.5" rx="1.5"/>
                                <path d="M6.5 8.5V6.75a3.5 3.5 0 017 0V8.5" stroke-linecap="round"/>
                            </svg>
                        </span>
                        <input :type="show ? 'text' : 'password'" name="password" required autocomplete="current-password"
                               placeholder="••••••••"
                               class="w-full bg-white border border-brand-border rounded-xl pl-11 pr-11 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                        <button type="button" @click="show = !show"
                                class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-brand-grey hover:text-brand-dark transition-colors"
                                :aria-label="show ? 'Hide password' : 'Show password'">
                            <svg x-show="!show" class="w-4.5 h-4.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                <path d="M2.5 10s2.8-4.5 7.5-4.5S17.5 10 17.5 10 14.7 14.5 10 14.5 2.5 10 2.5 10z" stroke-linejoin="round"/>
                                <circle cx="10" cy="10" r="2.2"/>
                            </svg>
                            <svg x-show="show" x-cloak class="w-4.5 h-4.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                <path d="M4 4l12 12" stroke-linecap="round"/>
                                <path d="M8 5.9A8 8 0 0117.5 10a9.4 9.4 0 01-2.2 2.8M5.3 6.7A9 9 0 002.5 10s2.8 4.5 7.5 4.5a7 7 0 002-.3" stroke-linecap="round"/>
                                <path d="M8 8.2a2.5 2.5 0 003.6 3" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </label>

                <label class="flex items-center gap-2 text-xs font-semibold text-brand-grey select-none">
                    <input type="checkbox" name="remember" value="1"
                           class="w-4 h-4 rounded border-brand-border text-brand-orange focus:ring-brand-orange/30">
                    Keep me signed in
                </label>

                <button type="submit"
                        class="group w-full bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-all shadow-md shadow-brand-orange/25 hover:shadow-lg hover:shadow-brand-orange/30 hover:-translate-y-px">
                    <span class="inline-flex items-center gap-1.5">
                        Sign in
                        <svg class="w-4 h-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M4 10h11m0 0l-4-4m4 4l-4 4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                </button>
            </form>
        </div>

        <p class="text-center text-xs text-white/30 mt-6">
            <a href="/" class="hover:text-brand-orange transition-colors">← Back to alabiq.com</a>
        </p>
        <p class="text-center text-[11px] text-white/20 mt-2">Restricted to authorized administrators.</p>
    </div>
</body>
</html>
