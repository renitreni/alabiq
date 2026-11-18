<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use App\Models\Merchant;

class MerchantFactory extends Factory
{
    protected $model = Merchant::class;

    public function definition(): array
    {
        return [
            'id' => $this->faker->uuid(),
            'owner_id' => App\Models\Profile::factory(),
            'name' => $this->faker->company(),
            'description' => $this->faker->paragraph(),
            'category' => $this->faker->randomElement(['restaurant', 'cafe', 'grocery', 'pharmacy']),
            'phone' => $this->faker->phoneNumber(),
            'email' => $this->faker->unique()->safeEmail(),
            'address' => $this->faker->address(),
            'lat' => $this->faker->latitude(21, 25),
            'lng' => $this->faker->longitude(39, 47),
            'radius_km' => 15,
            'delivery_fee' => 10,
            'min_order' => 30,
            'commission_rate' => 0.10,
            'credit_limit' => 500,
            'credit_used' => 0,
            'is_active' => true,
            'accepting_orders' => true,
            'image_url' => null,
            'cover_url' => null,
        ];
    }
}

