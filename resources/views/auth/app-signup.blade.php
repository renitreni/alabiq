<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Create account — Alabiq</title>
    <meta name="description" content="Create your free Alabiq account to order food, book rides and track deliveries across Riyadh.">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-brand-light text-brand-dark flex">

    {{-- Brand panel (desktop) — matches the app sign-in page layout --}}
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
                    Join Alabiq
                </div>
                <h1 class="text-4xl xl:text-5xl font-black tracking-tight text-brand-black leading-[1.1]">
                    One account, every
                    <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-red">service</span>
                </h1>
                <p class="text-brand-grey text-base leading-relaxed mt-4 max-w-md">
                    Create a free account to order from Riyadh's best restaurants, book airport transfers and track everything live.
                </p>
            </div>

            <ul class="space-y-4">
                @php($features = ['Order in a few taps, pay with STC Pay', 'Live GPS tracking on every order', 'Order history, receipts and favorites'])
                @foreach ([
                    'M13 10V3L4 14h7v7l9-11h-7z',
                    'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
                    'M4 6h16M4 10h16M4 14h16M4 18h10',
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

    {{-- Sign-up column --}}
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
            <div class="w-full max-w-[420px]" x-data="appSignup()">

                <div class="mb-8 text-center lg:text-left">
                    <h2 class="text-2xl sm:text-3xl font-black text-brand-black tracking-tight">Create your account</h2>
                    <p class="text-brand-grey text-sm mt-2">Free to join — takes less than a minute</p>
                </div>

                <div class="bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/8 p-6 sm:p-8">

                    {{-- Error banner --}}
                    <div x-show="error" x-cloak class="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium" x-text="error"></div>

                    <form @submit.prevent="submit()" novalidate class="space-y-5">

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Full name</span>
                            <div class="relative mt-1.5">
                                <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <circle cx="10" cy="6.5" r="3"/>
                                        <path d="M4 16.5c1.2-2.6 3.4-4 6-4s4.8 1.4 6 4" stroke-linecap="round"/>
                                    </svg>
                                </span>
                                <input type="text" x-model="fullName" placeholder="Your full name" autocomplete="name" maxlength="120"
                                       class="w-full bg-white border border-brand-border rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                            </div>
                        </label>

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Email Address</span>
                            <div class="relative mt-1.5">
                                <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <path d="M3 5.5h14v9H3z" strokejoin="round"/>
                                        <path d="M3.5 6l6.5 5 6.5-5" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </span>
                                <input type="email" x-model="email" placeholder="you@example.com" autocomplete="email"
                                       class="w-full bg-white border border-brand-border rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                            </div>
                        </label>

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Mobile <span class="font-semibold text-brand-grey">(optional)</span></span>
                            <div class="relative mt-1.5">
                                <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <path d="M6 3h8a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" stroke-linejoin="round"/>
                                        <path d="M8.5 14.5h3" stroke-linecap="round"/>
                                    </svg>
                                </span>
                                <input type="tel" x-model="mobile" placeholder="+966 5X XXX XXXX" autocomplete="tel" maxlength="40"
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
                                <input :type="show ? 'text' : 'password'" x-model="password" placeholder="At least 8 characters" autocomplete="new-password"
                                       class="w-full bg-white border border-brand-border rounded-xl pl-11 pr-11 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                                <button type="button" @click="show = !show"
                                        class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-brand-grey hover:text-brand-dark transition-colors"
                                        :aria-label="show ? 'Hide password' : 'Show password'">
                                    <svg x-show="!show" class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <path d="M2.5 10s2.8-4.5 7.5-4.5S17.5 10 17.5 10 14.7 14.5 10 14.5 2.5 10 2.5 10z" strokejoin="round"/>
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

                        <label class="block">
                            <span class="text-xs font-bold text-brand-dark">Confirm password</span>
                            <div class="relative mt-1.5">
                                <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-grey pointer-events-none">
                                    <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                                        <rect x="4" y="8.5" width="12" height="7.5" rx="1.5"/>
                                        <path d="M6.5 8.5V6.75a3.5 3.5 0 017 0V8.5" stroke-linecap="round"/>
                                        <path d="M7.5 12l1.8 1.8 3.4-3.4" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </span>
                                <input :type="show ? 'text' : 'password'" x-model="confirm" placeholder="Repeat your password" autocomplete="new-password"
                                       class="w-full bg-white border border-brand-border rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm placeholder:text-brand-grey/50 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition">
                            </div>
                        </label>

                        <button type="submit" :disabled="busy"
                                class="w-full mt-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-all shadow-md shadow-brand-orange/25 hover:shadow-lg hover:shadow-brand-orange/30 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 inline-flex items-center justify-center gap-2">
                            <svg x-show="busy" x-cloak class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                                <path class="opacity-90" d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                            </svg>
                            <span x-text="busy ? 'Creating your account…' : 'Create account'"></span>
                        </button>
                    </form>

                    <p class="text-xs text-brand-grey text-center mt-5 leading-relaxed">
                        By creating an account you agree to our
                        <a href="/terms-of-service" class="font-bold text-brand-orange hover:underline underline-offset-2">Terms of Service</a>
                        and
                        <a href="/privacy-policy" class="font-bold text-brand-orange hover:underline underline-offset-2">Privacy Policy</a>.
                    </p>

                    <div class="relative my-6">
                        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-brand-border"></div></div>
                        <div class="relative flex justify-center text-xs uppercase tracking-wider">
                            <span class="bg-white px-3 text-brand-grey font-bold">or</span>
                        </div>
                    </div>

                    <p class="text-sm text-brand-grey text-center">
                        Already have an account?
                        <a :href="'/login' + nextQuery()" class="text-brand-orange font-bold hover:underline underline-offset-2">Sign in</a>
                    </p>
                </div>
            </div>
        </div>
    </div>

    <script>
        // App sign-up — POST /api/auth/signup then straight into /api/auth/login so
        // the account is usable immediately; token lands under sm_api_session
        // (same key as the app sign-in page and the archived React portal).
        function appSignup() {
            return {
                fullName: '',
                email: '',
                mobile: '',
                password: '',
                confirm: '',
                show: false,
                busy: false,
                error: null,

                nextQuery() {
                    const next = new URLSearchParams(window.location.search).get('next');
                    const safe = next && next.startsWith('/') && !next.startsWith('//') && next !== '/signup';
                    return safe ? '?next=' + encodeURIComponent(next) : '';
                },

                destination(role) {
                    if (role === 'admin') return '/admin';
                    const next = new URLSearchParams(window.location.search).get('next');
                    const safe = next && next.startsWith('/') && !next.startsWith('//')
                        && next !== '/login' && next !== '/signup' && !next.startsWith('/admin');
                    return safe ? next : '/demo/restaurant';
                },

                validate() {
                    const email = this.email.trim();
                    if (!this.fullName.trim()) return 'Enter your full name.';
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
                    if (this.password.length < 8) return 'Password must be at least 8 characters.';
                    if (!/\d/.test(this.password) && !/[^A-Za-z0-9]/.test(this.password)) {
                        return 'Password must include at least one number or special character.';
                    }
                    if (this.confirm !== this.password) return 'Passwords do not match.';
                    return null;
                },

                async submit() {
                    this.error = this.validate();
                    if (this.error) return;

                    this.busy = true;
                    try {
                        const res = await fetch('/api/auth/signup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({
                                email: this.email.trim(),
                                password: this.password,
                                full_name: this.fullName.trim(),
                                mobile_number: this.mobile.trim() || null,
                            }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            this.error = (data.details && data.details.length)
                                ? data.details[0]
                                : (data.error || 'Sign up failed. Please try again.');
                            return;
                        }

                        // Account created — sign in immediately, then land by role.
                        const loginRes = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ email: this.email.trim(), password: this.password }),
                        });
                        const loginData = await loginRes.json().catch(() => ({}));
                        if (!loginRes.ok) {
                            // Sign-up worked even if the auto sign-in didn't — send them to sign in.
                            window.location.href = '/login' + this.nextQuery();
                            return;
                        }

                        localStorage.setItem('sm_api_session', loginData.token);
                        window.location.href = this.destination(loginData.user?.profile?.role ?? null);
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
