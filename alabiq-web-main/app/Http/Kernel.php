<?php

namespace App\Http;

use Illuminate\Foundation\Http\Kernel as HttpKernel;

class Kernel extends HttpKernel
{
    /**
     * The application's global HTTP middleware stack.
     *
     * These middleware are run during every request to your application.
     *
     * @var array<int, class-string|string>
     */
    protected $middleware = [
        \App\Http\Middleware\TrustProxy::class,
        \Illuminate\Http\Middleware\HandleCors::class,
        \Illuminate\Foundation\Http\Middleware\ValidatePostSize::class,
        \Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull::class,
    ];

    /**
     * The application's route middleware groups.
     *
     * @var array<string, array<int, class-string|string>>
     */
    protected $middlewareGroups = [
        'web' => [
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
        ],

        'api' => [
            \Illuminate\Routing\Middleware\ThrottleRequests::class.':api',
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
        ],
    ];

    /**
     * The application's route middleware.
     *
     * These middleware may be assigned to groups or used individually.
     *
     * @var array<string, class-string|string>
     */
    protected $middlewareAliases = [
        'auth' => \App\Http\Middleware\Authenticate::class,
        'auth.api' => \App\Http\Middleware\Authenticate::class,
        'admin' => \App\Http\Middleware\RequireAdmin::class,
        'driver' => \App\Http\Middleware\RequireDriver::class,
        'merchant' => \App\Http\Middleware\RequireMerchant::class,
        'merchant.vertical' => \App\Http\Middleware\RequireMerchantVertical::class,
        'driver.approved' => \App\Http\Middleware\RequireApprovedDriver::class,
        'food.auth' => \App\Http\Middleware\FoodAuth::class,
        'idempotency' => \App\Http\Middleware\Idempotency::class,
        'partner.auth' => \App\Http\Middleware\PartnerAuth::class,
        'throttle' => \Illuminate\Routing\Middleware\ThrottleRequests::class,
        'feature' => \App\Http\Middleware\FeatureFlag::class,
    ];
}