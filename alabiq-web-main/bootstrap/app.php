<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withProviders([
        \Illuminate\Foundation\Providers\FoundationServiceProvider::class,
        \Illuminate\Auth\AuthServiceProvider::class,
        \Illuminate\Broadcasting\BroadcastServiceProvider::class,
        \Illuminate\Bus\BusServiceProvider::class,
        \Illuminate\Cache\CacheServiceProvider::class,
        \Illuminate\Foundation\Providers\ConsoleSupportServiceProvider::class,
        \Illuminate\Cookie\CookieServiceProvider::class,
        \Illuminate\Database\DatabaseServiceProvider::class,
        \Illuminate\Encryption\EncryptionServiceProvider::class,
        \Illuminate\Filesystem\FilesystemServiceProvider::class,
        \Illuminate\Hashing\HashServiceProvider::class,
        \Illuminate\Mail\MailServiceProvider::class,
        \Illuminate\Notifications\NotificationServiceProvider::class,
        \Illuminate\Pagination\PaginationServiceProvider::class,
        \Illuminate\Pipeline\PipelineServiceProvider::class,
        \Illuminate\Queue\QueueServiceProvider::class,
        \Illuminate\Redis\RedisServiceProvider::class,
        \Illuminate\Auth\Passwords\PasswordResetServiceProvider::class,
        \Illuminate\Session\SessionServiceProvider::class,
        \Illuminate\Translation\TranslationServiceProvider::class,
        \Illuminate\Validation\ValidationServiceProvider::class,
        \Illuminate\View\ViewServiceProvider::class,
        \Illuminate\Events\EventServiceProvider::class,
        \Illuminate\Log\LogServiceProvider::class,
        \App\Providers\AppServiceProvider::class,
        \App\Providers\AuthServiceProvider::class,
        \App\Providers\HashServiceProvider::class,
        \App\Providers\RouteServiceProvider::class,
    ])
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
    )
    ->withCommands([
        __DIR__.'/../routes/console.php',
    ])
    ->withSchedule(function (\Illuminate\Console\Scheduling\Schedule $schedule) {
        // Dispatch sweeper - runs every 30 seconds
        $schedule->command('dispatch:sweep')->everyThirtySeconds();

        // Food preparing reminders - runs every 5 minutes
        $schedule->command('food:remind-preparing')->everyFiveMinutes();

        // Shop stale orders check - runs every 10 minutes
        $schedule->command('shop:check-stale')->everyTenMinutes();

        // Session pruning - runs daily at 3 AM
        $schedule->command('sessions:prune')->dailyAt('03:00');

        // Error log pruning - runs daily at 4 AM
        $schedule->command('errors:prune')->dailyAt('04:00');
    })
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [
            \App\Http\Middleware\TrustProxy::class,
        ]);
        $middleware->throttleApi();
        $middleware->alias([
            'auth' => \App\Http\Middleware\Authenticate::class,
            'admin' => \App\Http\Middleware\RequireAdmin::class,
            'driver' => \App\Http\Middleware\RequireDriver::class,
            'driver.approved' => \App\Http\Middleware\RequireApprovedDriver::class,
            'merchant' => \App\Http\Middleware\RequireMerchant::class,
            'merchant.vertical' => \App\Http\Middleware\RequireMerchantVertical::class,
            'feature' => \App\Http\Middleware\FeatureFlag::class,
            'food.auth' => \App\Http\Middleware\FoodAuth::class,
            'partner.auth' => \App\Http\Middleware\PartnerAuth::class,
            'idempotency' => \App\Http\Middleware\Idempotency::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->renderable(function (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $e->errors(),
            ], 400);
        });
        $exceptions->renderable(function (\Illuminate\Auth\AuthenticationException $e) {
            return response()->json(['error' => 'Authentication required'], 401);
        });
        $exceptions->renderable(function (\Illuminate\Auth\Access\AuthorizationException $e) {
            return response()->json(['error' => 'Access denied'], 403);
        });
        $exceptions->renderable(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e) {
            return response()->json(['error' => 'Not found'], 404);
        });
        $exceptions->renderable(function (\Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException $e) {
            return response()->json(['error' => 'Method not allowed'], 405);
        });
        $exceptions->renderable(function (\Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException $e) {
            return response()->json(['error' => 'Too many requests. Please try again later.'], 429);
        });
        $exceptions->renderable(function (\Throwable $e) {
            return response()->json(['error' => 'Unexpected server error'], 500);
        });
    })
    ->create();