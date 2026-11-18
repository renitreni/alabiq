<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Rate Limiter Configurations
    |--------------------------------------------------------------------------
    |
    | These configurations map to the rate limiters defined in
    | App\Providers\RouteServiceProvider::configureRateLimiting()
    |
    */

    'limiters' => [
        // General API limiter: 240 requests per minute
        'api' => [
            'limit' => 240,
            'decay' => 60,
        ],

        // Auth endpoints: 20 requests per minute
        'auth' => [
            'limit' => 20,
            'decay' => 60,
        ],

        // Signup: stricter, longer window
        'signup' => [
            'limit' => 5,
            'decay' => 300, // 5 minutes
        ],

        // Booking proof endpoints
        'booking_proof' => [
            'limit' => 30,
            'decay' => 60,
        ],

        // Booking lookup (public)
        'booking_lookup' => [
            'limit' => 60,
            'decay' => 60,
        ],

        // Driver accept/ride endpoints
        'driver_accept' => [
            'limit' => 30,
            'decay' => 60,
        ],

        // Driver location updates
        'driver_location' => [
            'limit' => 120,
            'decay' => 60,
        ],

        // Food search/discovery
        'food_search' => [
            'limit' => 120,
            'decay' => 60,
        ],

        // Food checkout
        'food_checkout' => [
            'limit' => 30,
            'decay' => 60,
        ],

        // Food payment proof
        'food_pay' => [
            'limit' => 30,
            'decay' => 60,
        ],

        // Food events (analytics)
        'food_events' => [
            'limit' => 120,
            'decay' => 60,
        ],

        // Card charge (Tap)
        'card_charge' => [
            'limit' => 20,
            'decay' => 60,
        ],

        // Shop search
        'shop_search' => [
            'limit' => 120,
            'decay' => 60,
        ],

        // Shop checkout
        'shop_checkout' => [
            'limit' => 30,
            'decay' => 60,
        ],

        // Shop payment
        'shop_pay' => [
            'limit' => 30,
            'decay' => 60,
        ],

        // Shop events
        'shop_events' => [
            'limit' => 120,
            'decay' => 60,
        ],

        // Location search/reverse/nearby
        'location_search' => [
            'limit' => 60,
            'decay' => 60,
        ],

        'location_reverse' => [
            'limit' => 60,
            'decay' => 60,
        ],

        'location_nearby' => [
            'limit' => 60,
            'decay' => 60,
        ],

        // Route/directions
        'route' => [
            'limit' => 60,
            'decay' => 60,
        ],

        // Webhook endpoints (Tap, Partner)
        'webhook' => [
            'limit' => 120,
            'decay' => 60,
        ],

        // Payment methods
        'payment_methods' => [
            'limit' => 60,
            'decay' => 60,
        ],

        'payment_methods_write' => [
            'limit' => 20,
            'decay' => 60,
        ],

        // Partner API
        'partner_api' => [
            'limit' => 120,
            'decay' => 60,
        ],

        // Merchant orders
        'merchant_order' => [
            'limit' => 30,
            'decay' => 60,
        ],
    ],
];