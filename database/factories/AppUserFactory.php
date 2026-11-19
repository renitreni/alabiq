<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use App\Models\AppUser;

class AppUserFactory extends Factory
{
    protected $model = AppUser::class;

    public function definition(): array
    {
        return [
            'id' => $this->faker->uuid(),
            'email' => $this->faker->unique()->safeEmail(),
            // 'hash' is bound to the custom ScryptHasher (not the manager), so
            // the bcrypt() helper (app('hash')->driver(...)) cannot be used here.
            'password_hash' => Hash::make('password'),
            'email_verified_at' => now(),
            'disabled_at' => null,
            'last_login_at' => now(),
        ];
    }
}

