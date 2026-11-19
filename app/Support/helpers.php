<?php

if (!function_exists('config_alabiq')) {
    /**
     * Get a value from the alabiq config.
     */
    function config_alabiq(string $key, mixed $default = null): mixed
    {
        return config('alabiq.' . $key, $default);
    }
}

if (!function_exists('money_to_minor')) {
    /**
     * Convert major currency units to minor (e.g., SAR to halala).
     */
    function money_to_minor(float $amount): int
    {
        return (int) round($amount * 100);
    }
}

if (!function_exists('minor_to_money')) {
    /**
     * Convert minor currency units to major (e.g., halala to SAR).
     */
    function minor_to_money(int $minor): float
    {
        return $minor / 100.0;
    }
}

if (!function_exists('generate_booking_code')) {
    /**
     * Generate a booking code like SM-XXXXXXXXXXXX.
     */
    function generate_booking_code(): string
    {
        return 'SM-' . strtoupper(str_replace('-', '', \Illuminate\Support\Str::uuid()->toString()));
    }
}

if (!function_exists('generate_food_order_code')) {
    /**
     * Generate a food order code like FD-XXXXXXXXXXXX.
     */
    function generate_food_order_code(): string
    {
        return 'FD-' . strtoupper(str_replace('-', '', \Illuminate\Support\Str::uuid()->toString()));
    }
}

if (!function_exists('generate_shop_order_code')) {
    /**
     * Generate a shop order code like SH-XXXXXXXXXXXX.
     */
    function generate_shop_order_code(): string
    {
        return 'SH-' . strtoupper(str_replace('-', '', \Illuminate\Support\Str::uuid()->toString()));
    }
}

if (!function_exists('hash_token')) {
    /**
     * Hash a token using SHA-256 (matching Express appSessions.js).
     */
    function hash_token(string $token): string
    {
        return hash('sha256', $token);
    }
}

if (!function_exists('generate_token')) {
    /**
     * Generate a secure random token (matching Express appSessions.js).
     */
    function generate_token(): string
    {
        return Base64UrlSafe::encode(random_bytes(32));
    }
}

if (!function_exists('is_admin_email')) {
    /**
     * Check if an email is in the admin emails list.
     */
    function is_admin_email(string $email): bool
    {
        $adminEmails = config('alabiq.admin_emails', []);
        return in_array(strtolower($email), array_map('strtolower', $adminEmails));
    }
}