<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use App\Models\AppUser;

class AppUserFactory extends Factory
{
    protected $model = AppUser::class;

    public function definition(): array
    {
        return [
            'id' => $this->faker->uuid(),
            'email' => $this->faker->unique()->safeEmail(),
            'password_hash' => bcrypt('password'),
            'email_verified_at' => now(),
            'disabled_at' => null,
            'last_login_at' => now(),
        ];
    }
}

