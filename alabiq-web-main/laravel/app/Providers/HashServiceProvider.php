<?php

namespace App\Providers;

use Illuminate\Hashing\HashServiceProvider as ServiceProvider;
use Illuminate\Contracts\Hashing\Hasher as HasherContract;
use App\Hashing\ScryptHasher;

class HashServiceProvider extends ServiceProvider
{
    /**
     * Register the application's hashers.
     */
    public function register(): void
    {
        $this->app->extend(HasherContract::class, function () {
            return new ScryptHasher();
        });
    }
}