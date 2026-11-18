<?php

return [
    'tap' => [
        'secret_key' => env('TAP_SECRET_KEY'),
        'public_key' => env('TAP_PUBLIC_KEY'),
        'merchant_id' => env('TAP_MERCHANT_ID'),
        'api_base' => env('TAP_API_BASE', 'https://api.tap.company'),
        'apple_pay_enabled' => env('TAP_APPLE_PAY_ENABLED', false),
        'allow_non_3ds_on_file' => env('TAP_ALLOW_NON_3DS_ON_FILE', false),
        'max_saved_cards' => env('TAP_MAX_SAVED_CARDS', 5),
    ],

    'stc_pay' => [
        'number' => env('SMART_ALABIQ_STCPAY_NUMBER'),
        'recipient_name' => env('SMART_ALABIQ_STCPAY_NAME', 'Alabiq'),
        'auto_verify_test_mode' => env('AUTO_VERIFY_STCPAY_TEST_MODE', false),
    ],

    'mapbox' => [
        'access_token' => env('MAPBOX_ACCESS_TOKEN', ''),
        'base_url' => 'https://api.mapbox.com',
    ],

    'realtime' => [
        'internal_url' => env('REALTIME_INTERNAL_URL', 'http://realtime:4100'),
        'publish_token' => env('REALTIME_PUBLISH_TOKEN'),
    ],

    'vapid' => [
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject' => env('VAPID_SUBJECT', 'mailto:admin@alabiq.com'),
    ],

    'public_urls' => [
        'web' => env('PUBLIC_WEB_URL', 'https://alabiq.com'),
        'api' => env('PUBLIC_API_BASE', 'https://api.alabiq.com'),
    ],

    'platform' => [
        'timezone' => env('PLATFORM_TIMEZONE', 'Asia/Riyadh'),
    ],

    'features' => [
        'shop_enabled' => env('SHOP_ENABLED', false),
        'partner_api_enabled' => env('PARTNER_API_ENABLED', false),
        'worker_enabled' => env('WORKER_ENABLED', false),
        'legacy_food_marketplace_enabled' => env('LEGACY_FOOD_MARKETPLACE_ENABLED', true),
    ],

    'partner_api' => [
        'rate_limit_per_minute' => env('PARTNER_API_RATE_LIMIT_PER_MINUTE', 120),
        'quote_ttl_seconds' => env('PARTNER_QUOTE_TTL_SECONDS', 600),
        'idempotency_retention_hours' => env('PARTNER_IDEMPOTENCY_RETENTION_HOURS', 24),
        'webhook_secret_key' => env('PARTNER_WEBHOOK_SECRET_KEY'),
        'webhook_timeout_ms' => env('PARTNER_WEBHOOK_TIMEOUT_MS', 5000),
        'webhook_retry_window_hours' => env('PARTNER_WEBHOOK_RETRY_WINDOW_HOURS', 24),
    ],

    'worker' => [
        'dispatch_concurrency' => env('WORKER_DISPATCH_CONCURRENCY', 5),
        'webhook_concurrency' => env('WORKER_WEBHOOK_CONCURRENCY', 3),
        'gps_sampling_concurrency' => env('WORKER_GPS_SAMPLING_CONCURRENCY', 2),
        'job_lease_seconds' => env('WORKER_JOB_LEASE_SECONDS', 30),
        'heartbeat_interval_ms' => env('WORKER_HEARTBEAT_INTERVAL_MS', 10000),
    ],

    'location_redis' => [
        'ttl_seconds' => env('LOCATION_REDIS_TTL_SECONDS', 90),
        'sampling_interval_seconds' => env('LOCATION_SAMPLING_INTERVAL_SECONDS', 10),
        'accuracy_threshold_meters' => env('LOCATION_ACCURACY_THRESHOLD_METERS', 100),
        'max_plausible_speed_kmh' => env('LOCATION_MAX_PLAUSIBLE_SPEED_KMH', 120),
    ],

    'admin_emails' => array_filter(
        array_map('trim', explode(',', env('ADMIN_EMAILS', '')))
    ),

    'cors' => [
        'allowed_origins' => array_filter(
            array_map('trim', explode(',', env('CORS_ORIGINS', '')))
        ),
    ],
];