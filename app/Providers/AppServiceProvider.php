<?php

namespace App\Providers;

use Illuminate\Foundation\Vite;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Default string length for migrations
        Schema::defaultStringLength(191);

        // Force HTTPS in production
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
        }

        // Emit path-relative Vite asset URLs (/build/...) instead of absolute
        // ones, so CSS/JS keep loading when DNS for the app domain is down
        // and the page is reached by IP or a hosts-file override.
        app(Vite::class)->createAssetPathsUsing(
            fn (string $path, ?bool $secure = null) => Str::start($path, '/')
        );
    }
}
