<?php

namespace App\Providers;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Config;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to your application's "home" route.
     *
     * Typically, users are redirected here after authentication.
     *
     * @var string
     */
    public const HOME = '/home';

    /**
     * Define your route model bindings, pattern filters, and other route configuration.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();

        $this->routes(function () {
            // API routes are loaded in bootstrap/app.php
        });
    }

    /**
     * Configure the rate limiters for the application.
     */
    protected function configureRateLimiting(): void
    {
        $limiters = Config::get('rate-limiter.limiters', []);

        foreach ($limiters as $name => $config) {
            RateLimiter::for($name, function () use ($config) {
                // perMinute()'s 2nd arg is the decay window in minutes
                // (Limit::decayMinutes() was removed in newer framework versions).
                return \Illuminate\Cache\RateLimiting\Limit::perMinute($config['limit'], $config['decay'] / 60);
            });
        }
    }
}