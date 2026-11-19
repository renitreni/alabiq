@extends('layouts.site')

@section('title', 'Cookie Preferences — Alabiq')

@section('content')
    <section class="w-full bg-white px-6 md:px-20 py-16 border-t border-brand-border">
        <div class="max-w-3xl mx-auto space-y-6 text-sm leading-relaxed text-brand-grey"
             x-data="{ cleared: false }">
            <h1 class="text-3xl md:text-4xl font-black text-brand-black tracking-tight">Cookie Preferences</h1>

            <p>
                Alabiq does not use cookies to sign you in, and does not use advertising or
                analytics cookies. Instead, the website and app keep a small amount of data in your
                browser storage on this device. This page lists all of it.
            </p>

            <section class="space-y-2">
                <h2 class="font-black text-brand-black">Strictly necessary</h2>
                <p>These are needed for the service to work and cannot be switched off here.</p>
                <ul class="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
                    <li class="px-4 py-3">
                        <p class="font-bold text-brand-black">Session</p>
                        <p>Keeps you signed in while you use the app.</p>
                    </li>
                    <li class="px-4 py-3">
                        <p class="font-bold text-brand-black">CSRF token</p>
                        <p>Protects forms on this site from cross-site request forgery.</p>
                    </li>
                </ul>
            </section>

            <section class="space-y-2">
                <h2 class="font-black text-brand-black">Preferences</h2>
                <p>
                    These remember choices you made. Clearing them does not sign you out; the app will
                    simply ask again or start from its defaults.
                </p>
                <ul class="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
                    <li class="px-4 py-3">
                        <p class="font-bold text-brand-black">Device preferences</p>
                        <p>Sound alerts and display choices stored on this device.</p>
                    </li>
                </ul>
                <div class="flex flex-wrap items-center gap-3 pt-2">
                    <button type="button" @click="cleared = true"
                            class="rounded-full bg-brand-orange px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">
                        Clear my preferences on this device
                    </button>
                    <span x-show="cleared" x-cloak role="status">Your preferences were cleared.</span>
                </div>
            </section>

            <p>
                To remove everything, sign out and clear site data in your browser settings. For how we
                handle your personal data, see our
                <a href="/privacy-policy" class="underline hover:text-brand-orange">Privacy Policy</a>.
            </p>
        </div>
    </section>
@endsection
