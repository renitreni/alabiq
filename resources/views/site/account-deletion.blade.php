@extends('layouts.site')

@section('title', 'Delete your account — Alabiq')

@section('content')
    <section class="w-full bg-white px-6 md:px-20 py-16 border-t border-brand-border">
        <div class="max-w-3xl mx-auto space-y-6 text-sm leading-relaxed text-brand-grey">
            <h1 class="text-3xl md:text-4xl font-black text-brand-black tracking-tight">Delete your account</h1>

            <p>
                This page explains how to delete your Alabiq account and what happens to your
                data. Deletion is permanent and cannot be undone.
            </p>

            <section class="space-y-2">
                <h2 class="font-black text-brand-black">Option 1: delete from the app</h2>
                <p>
                    Open Alabiq, go to <strong>Profile</strong>, scroll to the bottom and choose
                    <strong>Delete Account</strong>. You will be asked to confirm. Your account is removed
                    immediately and you are signed out.
                </p>
            </section>

            <section class="space-y-2">
                <h2 class="font-black text-brand-black">Option 2: request deletion by email</h2>
                <p>
                    If you have already uninstalled the app, send a deletion request from the email address
                    on your account to
                    <a href="mailto:customerservice@alabiq.com" class="underline hover:text-brand-orange">customerservice@alabiq.com</a>.
                    We verify the request and complete the deletion within 30 days.
                </p>
            </section>

            <section class="space-y-2">
                <h2 class="font-black text-brand-black">What is deleted</h2>
                <ul class="list-disc space-y-1 pl-5">
                    <li>Your sign in credentials, so the account can no longer be used.</li>
                    <li>Your profile: full name, email address, mobile number, and WhatsApp number.</li>
                    <li>Your saved pickup and drop off addresses, and any GPS coordinates stored with them.</li>
                    <li>Your profile photo.</li>
                    <li>The contact details and delivery addresses attached to your past bookings and orders.</li>
                </ul>
            </section>

            <section class="space-y-2">
                <h2 class="font-black text-brand-black">What is kept, and why</h2>
                <ul class="list-disc space-y-1 pl-5">
                    <li>The record that a transaction happened, its amount, and the tax applied. Saudi tax and accounting law requires us to keep these.</li>
                    <li>Payment confirmations already reviewed by our finance team, for dispute resolution.</li>
                </ul>
                <p>
                    These retained records are stripped of the details that identify you. They cannot be
                    traced back to you or used to contact you.
                </p>
            </section>

            <p>
                See our
                <a href="/privacy-policy" class="underline hover:text-brand-orange">Privacy Policy</a>
                for the full description of how we handle personal data.
            </p>
        </div>
    </section>
@endsection
