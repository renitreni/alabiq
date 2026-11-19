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
<body class="min-h-screen bg-[#0c1018] flex items-center justify-center px-4 py-12 relative overflow-hidden">
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div class="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full bg-brand-orange/10 blur-[120px]"></div>
        <div class="absolute bottom-0 -left-40 w-[420px] h-[420px] rounded-full bg-brand-red/8 blur-[100px]"></div>
    </div>

    <div class="relative w-full max-w-md">
        <div class="text-center mb-8">
            <div class="inline-flex w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
                <img src="/alabiq-icon.png" alt="Alabiq" class="w-9 h-9 object-contain">
            </div>
            <h1 class="text-2xl font-black text-white tracking-tight">
                ALA<span class="text-brand-orange">BIQ</span> Control Center
            </h1>
            <p class="text-sm text-white/45 mt-1">Sign in with an admin account to continue.</p>
        </div>

        <div class="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
            @if ($errors->any())
                <div class="mb-5 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm font-semibold text-rose-700">
                    {{ $errors->first() }}
                </div>
            @endif

            <form method="POST" action="/login" class="space-y-4">
                @csrf

                <label class="block">
                    <span class="text-xs font-bold text-brand-dark">Email</span>
                    <input type="email" name="email" value="{{ old('email') }}" required autofocus
                           autocomplete="username"
                           class="mt-1.5 w-full bg-white border @error('email') border-brand-red @else border-brand-border @enderror rounded-xl px-4 py-3 text-brand-dark text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                </label>

                <label class="block">
                    <span class="text-xs font-bold text-brand-dark">Password</span>
                    <input type="password" name="password" required autocomplete="current-password"
                           class="mt-1.5 w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-brand-dark text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15">
                </label>

                <label class="flex items-center gap-2 text-xs font-semibold text-brand-grey">
                    <input type="checkbox" name="remember" value="1"
                           class="w-4 h-4 rounded border-brand-border text-brand-orange focus:ring-brand-orange/30">
                    Keep me signed in
                </label>

                <button type="submit"
                        class="w-full bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-colors shadow-md shadow-brand-orange/25">
                    Sign in
                </button>
            </form>
        </div>

        <p class="text-center text-xs text-white/30 mt-6">
            <a href="/" class="hover:text-brand-orange transition-colors">← Back to alabiq.com</a>
        </p>
    </div>
</body>
</html>
