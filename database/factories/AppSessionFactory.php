<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use App\Models\AppSession;

class AppSessionFactory extends Factory
{
    protected $model = AppSession::class;

    public function definition(): array
    {
        return [
            'id' => $this->faker->uuid(),
            'token_hash' => hash('sha256', $this->faker->uuid()),
            'user_id' => App\Models\AppUser::factory(),
            'last_seen_at' => now(),
            'idle_expires_at' => now()->addDays(30),
            'absolute_expires_at' => now()->addDays(90),
            'revoked_at' => null,
            'user_agent' => $this->faker->userAgent(),
            'ip' => $this->faker->ipv4(),
        ];
    }
}

