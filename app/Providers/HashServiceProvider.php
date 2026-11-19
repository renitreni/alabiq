<?php

namespace App\Providers;

use App\Hashing\ScryptHasher;
use Illuminate\Contracts\Hashing\Hasher as HasherContract;
use Illuminate\Contracts\Support\DeferrableProvider;
use Illuminate\Support\ServiceProvider;

/**
 * Replaces Laravel's hash bindings with the scrypt hasher so passwords stay
 * compatible with the Node/Express backend.
 *
 * Deferrable like Illuminate\Hashing\HashServiceProvider: because this
 * provider is registered after it, its `provides()` win the deferred-service
 * manifest and Illuminate's HashManager never overwrites the scrypt binding.
 */
class HashServiceProvider extends ServiceProvider implements DeferrableProvider
{
    public function register(): void
    {
        $this->app->singleton('hash', fn () => new ScryptHasher());
        $this->app->singleton('hash.driver', fn ($app) => $app['hash']);
        $this->app->alias('hash', HasherContract::class);
    }

    public function provides(): array
    {
        return ['hash', 'hash.driver', HasherContract::class];
    }
}
