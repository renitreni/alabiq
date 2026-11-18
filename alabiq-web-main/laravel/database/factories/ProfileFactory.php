<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use App\Models\Profile;

class ProfileFactory extends Factory
{
    protected $model = Profile::class;

    public function definition(): array
    {
        return [
            'id' => $this->faker->uuid(),
            'email' => $this->faker->unique()->safeEmail(),
            'full_name' => $this->faker->name(),
            'role' => 'passenger',
            'date_of_birth' => $this->faker->date(),
            'gender' => $this->faker->randomElement(['male', 'female']),
            'national_id' => $this->faker->numerify('################'),
            'mobile_number' => $this->faker->phoneNumber(),
            'whatsapp_number' => $this->faker->phoneNumber(),
            'vehicle_type' => null,
            'vehicle_plate' => null,
            'driver_approved' => false,
            'driver_verification_status' => 'pending',
            'service_types' => ['pick_drop', 'food', 'shop'],
            'avatar_url' => null,
            'address' => $this->faker->address(),
            'cash_owed' => 0,
            'cash_owed_limit' => 500,
            'is_super_admin' => false,
            'disabled_at' => null,
            'disabled_by' => null,
        ];
    }
}

