<?php

return [
    'database' => [
        'url' => env('DATABASE_URL', ''),
        'pool_max' => (int) env('DATABASE_POOL_MAX', 20),
        'idle_timeout_ms' => (int) env('DATABASE_IDLE_TIMEOUT_MS', 30000),
        'connection_timeout_ms' => (int) env('DATABASE_CONNECTION_TIMEOUT_MS', 5000),
    ],

    'email' => [
        'smtp_host' => env('MAIL_HOST', ''),
        'smtp_port' => (int) env('MAIL_PORT', 587),
        'smtp_secure' => env('MAIL_ENCRYPTION', 'tls') === 'ssl',
        'smtp_user' => env('MAIL_USERNAME', ''),
        'smtp_password' => env('MAIL_PASSWORD', ''),
        'from' => env('MAIL_FROM_ADDRESS', ''),
    ],

    'object_storage' => [
        'endpoint' => env('AWS_ENDPOINT', ''),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
        'access_key' => env('AWS_ACCESS_KEY_ID', ''),
        'secret_key' => env('AWS_SECRET_ACCESS_KEY', ''),
        'force_path_style' => env('AWS_USE_PATH_STYLE_ENDPOINT', true),
    ],

    'platform' => [
        'timezone' => env('PLATFORM_TIMEZONE', 'Asia/Riyadh'),
    ],

    'auto_verify_test_mode' => env('AUTO_VERIFY_STCPAY_TEST_MODE', false),

    'payment_mode' => env('PAYMENT_MODE', 'stcpay_manual'),

    'stc_pay' => [
        'number' => env('SMART_ALABIQ_STCPAY_NUMBER', ''),
        'recipient_name' => env('SMART_ALABIQ_STCPAY_NAME', 'Alabiq'),
    ],

    'proofs' => [
        'bucket' => env('PAYMENT_PROOF_BUCKET', 'payment-proofs'),
        'upload_url_ttl_seconds' => (int) env('PAYMENT_PROOF_UPLOAD_TTL', 900),
        'download_url_ttl_seconds' => (int) env('PAYMENT_PROOF_DOWNLOAD_TTL', 3600),
        'max_bytes' => (int) env('PAYMENT_PROOF_MAX_BYTES', 10 * 1024 * 1024),
        'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    ],

    'merchant_images' => [
        'bucket' => env('MERCHANT_IMAGES_BUCKET', 'merchant-images'),
        'upload_url_ttl_seconds' => (int) env('MERCHANT_IMAGES_UPLOAD_TTL', 900),
        'max_bytes' => (int) env('MERCHANT_IMAGES_MAX_BYTES', 5 * 1024 * 1024),
        'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp'],
    ],

    'avatars' => [
        'bucket' => env('AVATARS_BUCKET', 'avatars'),
        'upload_url_ttl_seconds' => (int) env('AVATARS_UPLOAD_TTL', 900),
        'max_bytes' => (int) env('AVATARS_MAX_BYTES', 5 * 1024 * 1024),
        'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp'],
    ],

    'driver_docs' => [
        'bucket' => env('DRIVER_DOCS_BUCKET', 'driver-docs'),
        'upload_url_ttl_seconds' => (int) env('DRIVER_DOCS_UPLOAD_TTL', 900),
        'download_url_ttl_seconds' => (int) env('DRIVER_DOCS_DOWNLOAD_TTL', 3600),
        'max_bytes' => (int) env('DRIVER_DOCS_MAX_BYTES', 10 * 1024 * 1024),
        'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    ],

    'session' => [
        'idle_days' => 30,
        'absolute_days' => 90,
        'touch_every_ms' => 5 * 60 * 1000,
    ],

    'vat' => [
        'rate' => 0.15,
    ],

    'money' => [
        'currency' => 'SAR',
        'precision' => 2,
    ],

    'fare' => [
        'base_fare' => 5.00,
        'per_km' => 1.50,
        'per_minute' => 0.50,
        'minimum_fare' => 15.00,
        'airport_surcharge' => 20.00,
        'night_surcharge_multiplier' => 1.25,
        'peak_surcharge_multiplier' => 1.25,
    ],

    'food' => [
        'minimum_order' => 30.00,
        'max_distance_km' => 15,
        'delivery_fee_base' => 5.00,
        'delivery_fee_per_km' => 1.00,
        'platform_fee_percent' => 0.10,
        'vat_inclusive' => true,
    ],

    'shop' => [
        'minimum_order' => 50.00,
        'max_distance_km' => 15,
        'delivery_fee_base' => 10.00,
        'delivery_fee_per_km' => 1.50,
        'platform_fee_percent' => 0.15,
        'cod_fee' => 5.00,
        'vat_inclusive' => true,
    ],

    'dispatch' => [
        'offer_timeout_seconds' => 30,
        'max_offers_per_driver' => 3,
        'search_radius_km' => 10,
        'expand_radius_km' => 5,
        'max_expand_attempts' => 3,
    ],

    'eta' => [
        'traffic_factor' => 1.3,
        'buffer_seconds' => 120,
    ],

    'google_routes' => [
        'api_key' => env('GOOGLE_MAPS_API_KEY', ''),
        'enabled' => false,
    ],

    'mapbox' => [
        'access_token' => env('MAPBOX_ACCESS_TOKEN', ''),
    ],

    'payment' => [
        'stcpay_enabled' => true,
        'tap_enabled' => false,
    ],

    'tap' => [
        'secret_key' => env('TAP_SECRET_KEY', ''),
        'public_key' => env('TAP_PUBLIC_KEY', ''),
        'merchant_id' => env('TAP_MERCHANT_ID', ''),
        'api_base' => env('TAP_API_BASE', 'https://api.tap.company'),
        'apple_pay_enabled' => env('TAP_APPLE_PAY_ENABLED', false),
        'allow_non_3ds_on_file' => env('TAP_ALLOW_NON_3DS_ON_FILE', false),
        'max_saved_cards' => env('TAP_MAX_SAVED_CARDS', 5),
    ],

    'public_urls' => [
        'web' => env('PUBLIC_WEB_URL', 'https://alabiq.com'),
        'api' => env('PUBLIC_API_BASE', 'https://api.alabiq.com'),
    ],

    'partner_api' => [
        'enabled' => env('PARTNER_API_ENABLED', false),
        'legacy_marketplace_enabled' => env('LEGACY_FOOD_MARKETPLACE_ENABLED', true),
        'rate_limit_per_minute' => (int) env('PARTNER_API_RATE_LIMIT_PER_MINUTE', 120),
        'quote_ttl_seconds' => (int) env('PARTNER_QUOTE_TTL_SECONDS', 600),
        'idempotency_retention_hours' => (int) env('PARTNER_IDEMPOTENCY_RETENTION_HOURS', 24),
        'webhook_secret_key' => env('PARTNER_WEBHOOK_SECRET_KEY', ''),
        'webhook_timeout_ms' => (int) env('PARTNER_WEBHOOK_TIMEOUT_MS', 5000),
        'webhook_retry_window_hours' => (int) env('PARTNER_WEBHOOK_RETRY_WINDOW_HOURS', 24),
    ],

    'worker' => [
        'enabled' => env('WORKER_ENABLED', false),
        'dispatch_concurrency' => (int) env('WORKER_DISPATCH_CONCURRENCY', 5),
        'webhook_concurrency' => (int) env('WORKER_WEBHOOK_CONCURRENCY', 3),
        'gps_sampling_concurrency' => (int) env('WORKER_GPS_SAMPLING_CONCURRENCY', 2),
        'job_lease_seconds' => (int) env('WORKER_JOB_LEASE_SECONDS', 30),
        'heartbeat_interval_ms' => (int) env('WORKER_HEARTBEAT_INTERVAL_MS', 10000),
    ],

    'location_redis' => [
        'ttl_seconds' => (int) env('LOCATION_REDIS_TTL_SECONDS', 90),
        'sampling_interval_seconds' => (int) env('LOCATION_SAMPLING_INTERVAL_SECONDS', 10),
        'accuracy_threshold_meters' => (int) env('LOCATION_ACCURACY_THRESHOLD_METERS', 100),
        'max_plausible_speed_kmh' => (int) env('LOCATION_MAX_PLAUSIBLE_SPEED_KMH', 120),
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
