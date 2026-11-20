<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in — Alabiq</title>
    <meta name="description" content="Sign in to your Alabiq account to order food, book rides and track deliveries.">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-brand-light text-brand-dark flex">

    {{-- Brand panel (desktop) — Blade port of the archived React app LoginPage --}}
    <div class="hidden lg:flex lg:w-[44%] xl:w-[42%] relative overflow-hidden bg-brand-warm flex-col justify-between p-10 xl:p-14">
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div class="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-brand-orange/15 blur-[100px]"></div>
            <div class="absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full bg-brand-red/10 blur-[90px]"></div>
            <div class="absolute inset-0 opacity-[0.35]"
                 style="background-image:linear-gradient(rgba(0,0,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.03) 1px,transparent 1px);background-size:48px 48px;"></div>
        </div>

        <a href="/" class="relative z-10 flex items-center gap-3 w-fit">
            <img src="/alabiq-icon.png" alt="Alabiq" class="w-12 h-12 object-contain">
            <span class="text-xl font-black tracking-tight text-brand-black">
                ALA<span class="text-brand-orange">BIQ</span>
            </span>
        </a>

        <div class="relative z-10 space-y-8">
            <div>
                <div class="inline-flex items-center gap-2 bg-white/80 border border-brand-orange/20 px-4 py-2 rounded-full text-brand-orange text-xs font-bold tracking-widest uppercase mb-6">
                    <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-60"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-brand-orange"></span>
                    </span>
                    All-in-one platform
                </div>
                <h1 class="text-4xl xl:text-5xl font-black tracking-tight text-brand-black leading-[1.1]">
                    Welcome back to
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">Alabiq</span>
                </h1>
                <p class="text-brand-grey text-base leading-relaxed mt-4 max-w-md">
                    Sign in to book rides, track deliveries, and manage your account — all in one place.
                </p>
            </div>

            @php($features = ['Order food from 500+ restaurants', 'Send packages with live tracking', 'Book rides & airport transfers'])
            <ul class="space-y-4">
                @foreach ([
                    'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 114 0 2 2 0 01-4 0z',
                    'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
                    'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
                ] as $i => $path)
                    <li class="flex items-center gap-3 text-brand-dark">
                        <span class="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-brand-border shadow-sm shadow-brand-orange/5">
                            <svg class="w-5 h-5 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25">
                                <path stroke-linecap="round" stroke-linejoin="round" d="{{ $path }}"/>
                            </svg>
                        </span>
                        <span class="text-sm font-semibold">{{ $features[$i] }}</span>
                    </li>
                @endforeach
            </ul>
        </div>

        <p class="relative z-10 text-xs text-brand-grey font-medium">
            © {{ date('Y') }} Alabiq. Fast delivery, easy booking.
        </p>
    </div>

    {{-- Sign-in column --}}
    <div class="flex-1 relative flex flex-col min-h-screen">
        <div class="absolute inset-0 pointer-events-none lg:hidden" aria-hidden="true">
            <div class="absolute -top-20 -right-20 w-[280px] h-[280px] rounded-full bg-brand-orange/10 blur-[80px]"></div>
            <div class="absolute bottom-0 -left-16 w-[240px] h-[240px] rounded-full bg-brand-red/5 blur-[70px]"></div>
        </div>

        <div class="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8">
            <a href="/" class="inline-flex items-center gap-2 text-sm font-bold text-brand-grey hover:text-brand-orange transition-colors">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7 7-7m-7 7h18"/></svg>
                Back to home
            </a>
            <a href="/" class="flex items-center gap-2 lg:hidden">
                <img src="/alabiq-icon.png" alt="Alabiq" class="w-9 h-9 object-contain">
                <span class="font-black tracking-tight text-brand-black text-sm">
                    ALA<span class="text-brand-orange">BIQ</span>
                </span>
            </a>
        </div>

        <div class="relative z-10 flex-1 flex items-center justify-center px-5 py-8 sm:px-8">
            <div class="w-full max-w-[420px]"
                 x-data="appLogin()"
                 x-init="init()">

                <div class="mb-8 text-center lg:text-left">
                    <h2 class="text-2xl sm:text-3xl font-black text-brand-black tracking-tight">Sign in</h2>
                    <p class="text-brand-grey text-sm mt-2">Enter your credentials to access your account</p>
                </div>

                <div class="bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/8 p-6 sm:p-8">

                    {{-- Error banner --}}
                    <div x-show="error" x-cloak class="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium" x-text="error"></div>

                    {{-- Already signed in (valid sm_api_session on this device) --}}
                    <div x-show="signedInEmail" x-cloak class="mb-5 p-3.5 rounded-xl bg-orange-50 border border-orange-200 text-sm">
                        <p class="text-brand-dark font-semibold">You're signed in as <span x-text="signedInEmail"></span>.</p>
                        <div class="mt-2.5 flex flex-wrap gap-2">
                            <button type="button" @click="continueSignedIn()" class="text-xs font-bold px-3.5 py-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90 transition-colors">Continue</button>
                            <button type="button" @click="useDifferentAccount()" class="text-xs font-bold px-3.5 py-2 rounded-lg border border-brand-border text-brand-grey hover:text-brand-dark transition-colors">Use a different account</button>
                        </div>
                    </div>

                    <form @submit.prevent="submit()" novalidate class="space-y-5">

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Email Address</span>
                            <div class="relative mt-1.5">
                                <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <path d="M3 5.5h14v9H3z" stroke-linejoin="round"/>
                                        <path d="M3.5 6l6.5 5 6.5-5" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </span>
                                <input type="email" x-model="email" placeholder="you@example.com" autocomplete="email"
                                       class="w-full bg-white border border-brand-border rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                            </div>
                        </label>

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Password</span>
                            <div class="relative mt-1.5">
                                <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <rect x="4" y="8.5" width="12" height="7.5" rx="1.5"/>
                                        <path d="M6.5 8.5V6.75a3.5 3.5 0 017 0V8.5" stroke-linecap="round"/>
                                    </svg>
                                </span>
                                <input :type="show ? 'text' : 'password'" x-model="password" placeholder="Enter your password" autocomplete="current-password"
                                       class="w-full bg-white border border-brand-border rounded-xl pl-11 pr-11 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                                <button type="button" @click="show = !show"
                                        class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-brand-grey hover:text-brand-dark transition-colors"
                                        :aria-label="show ? 'Hide password' : 'Show password'">
                                    <svg x-show="!show" class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <path d="M2.5 10s2.8-4.5 7.5-4.5S17.5 10 17.5 10 14.7 14.5 10 14.5 2.5 10 2.5 10z" stroke-linejoin="round"/>
                                        <circle cx="10" cy="10" r="2.2"/>
                                    </svg>
                                    <svg x-show="show" x-cloak class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <path d="M4 4l12 12" stroke-linecap="round"/>
                                        <path d="M8 5.9A8 8 0 0117.5 10a9.4 9.4 0 01-2.2 2.8M5.3 6.7A9 9 0 002.5 10s2.8 4.5 7.5 4.5a7 7 0 002-.3" stroke-linecap="round"/>
                                        <path d="M8 8.2a2.5 2.5 0 003.6 3" stroke-linecap="round"/>
                                    </svg>
                                </button>
                            </div>
                        </label>

                        <button type="submit" :disabled="busy"
                                class="w-full mt-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-all shadow-md shadow-brand-orange/25 hover:shadow-lg hover:shadow-brand-orange/30 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 inline-flex items-center justify-center gap-2">
                            <svg x-show="busy" x-cloak class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-90" d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                            </svg>
                            <span x-text="busy ? 'Signing in…' : 'Sign in'"></span>
                        </button>
                    </form>

                    <div class="relative my-6">
                        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-brand-border"></div></div>
                        <div class="relative flex justify-center text-xs uppercase tracking-wider">
                            <span class="bg-white px-3 text-brand-grey font-bold">or</span>
                        </div>
                    </div>

                    <p class="text-sm text-brand-grey text-center">
                        Don't have an account?
                        <a :href="signupHref()" class="text-brand-orange font-bold hover:underline underline-offset-2">Sign up</a>
                    </p>

                    <p class="text-xs text-brand-grey/80 text-center mt-4">
                        Admin? Use the
                        <a href="/admin/login" class="font-bold text-brand-orange hover:underline underline-offset-2">Control Center</a>.
                    </p>
                </div>
            </div>
        </div>
    </div>

    <script>
        // App sign-in — posts to the same API contract the mobile apps use and
        // keeps the session token under the sm_api_session key the archived
        // React portal used (and /cookie-preferences documents).
        function appLogin() {
            return {
                email: '',
                password: '',
                show: false,
                busy: false,
                error: null,
                signedInEmail: null,

                init() {
                    this.restoreSession();
                },

                async restoreSession() {
                    const token = localStorage.getItem('sm_api_session');
                    if (!token) return;
                    try {
                        const res = await fetch('/api/auth/session', {
                            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
                        });
                        if (!res.ok) {
                            localStorage.removeItem('sm_api_session');
                            return;
                        }
                        const data = await res.json();
                        this.signedInEmail = data.user?.email ?? 'your account';
                        this._token = token;
                        this._role = data.user?.profile?.role ?? null;
                    } catch (e) {
                        // Offline or transient failure — leave the form usable.
                    }
                },

                continueSignedIn() {
                    if (this._token) localStorage.setItem('sm_api_session', this._token);
                    window.location.href = this.destination(this._role);
                },

                useDifferentAccount() {
                    localStorage.removeItem('sm_api_session');
                    this.signedInEmail = null;
                    this._token = null;
                    this._role = null;
                    this.password = '';
                },

                signupHref() {
                    const next = new URLSearchParams(window.location.search).get('next');
                    const safe = next && next.startsWith('/') && !next.startsWith('//') && next !== '/login';
                    return '/signup' + (safe ? '?next=' + encodeURIComponent(next) : '');
                },

                destination(role) {
                    if (role === 'admin') return '/admin';
                    // Honor ?next= for same-origin app paths, never the control center.
                    const next = new URLSearchParams(window.location.search).get('next');
                    const safe = next && next.startsWith('/') && !next.startsWith('//')
                        && next !== '/login' && !next.startsWith('/admin');
                    return safe ? next : '/';
                },

                async submit() {
                    this.error = null;
                    const email = this.email.trim();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        this.error = 'Enter a valid email address.';
                        return;
                    }
                    if (!this.password) {
                        this.error = 'Enter your password.';
                        return;
                    }

                    this.busy = true;
                    try {
                        const res = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ email: email, password: this.password }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            this.error = data.error || 'Sign in failed. Please try again.';
                            return;
                        }

                        localStorage.setItem('sm_api_session', data.token);
                        window.location.href = this.destination(data.user?.profile?.role ?? null);
                    } catch (e) {
                        this.error = 'Network error — check your connection and try again.';
                    } finally {
                        this.busy = false;
                    }
                },
            };
        }
    </script>
</body>
</html>
