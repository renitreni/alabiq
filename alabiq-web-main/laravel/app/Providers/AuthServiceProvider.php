<?php

namespace App\Providers;

use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Auth;
use App\Models\AppUser;
use App\Models\Profile;
use App\Http\Middleware\AppSessionGuard;
use App\Services\AppSessionsService;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * The model to policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [
        // AppUser::class => AppUserPolicy::class,
    ];

    /**
     * Register any authentication / authorization services.
     */
    public function boot(): void
    {
        $this->registerPolicies();

        // Register custom guard
        Auth::extend('app_session', function ($app, $name, array $config) {
            return new AppSessionGuard(
                Auth::createUserProvider($config['provider'] ?? null),
                $app->make(AppSessionsService::class),
                $app->make('request')
            );
        });

        // Define gates for role-based access
        Gate::define('admin', function ($user) {
            return $user->hasRole('admin');
        });

        Gate::define('driver', function ($user) {
            return $user->hasRole('driver');
        });

        Gate::define('merchant', function ($user) {
            return $user->hasRole('merchant');
        });

        Gate::define('super-admin', function ($user) {
            return $user->isSuperAdmin();
        });
    }
}