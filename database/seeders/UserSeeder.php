<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    /**
     * Demo users for every role. Password is the same for all — dev/test only,
     * never run against production data without changing it.
     */
    private const PASSWORD = 'password123';

    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $users = [
            [
                'email' => 'passenger@alabiq.test',
                'full_name' => 'Demo Passenger',
                'role' => 'passenger',
            ],
            [
                'email' => 'driver@alabiq.test',
                'full_name' => 'Demo Driver',
                'role' => 'driver',
                'driver_approved' => true,
                'driver_verification_status' => 'approved',
                'vehicle_type' => 'sedan',
                'vehicle_plate' => 'DEMO-1234',
                'service_types' => ['pick_drop', 'food'],
            ],
            [
                'email' => 'merchant@alabiq.test',
                'full_name' => 'Demo Merchant',
                'role' => 'merchant',
            ],
            [
                'email' => 'admin@alabiq.test',
                'full_name' => 'Demo Admin',
                'role' => 'admin',
                'is_super_admin' => true,
            ],
        ];

        foreach ($users as $user) {
            $email = strtolower($user['email']);

            $existing = DB::table('app_users')->whereRaw('LOWER(email) = ?', [$email])->first();

            $profile = [
                'email' => $email,
                'full_name' => $user['full_name'],
                'role' => $user['role'],
                'vehicle_type' => $user['vehicle_type'] ?? null,
                'vehicle_plate' => $user['vehicle_plate'] ?? null,
                'driver_approved' => $user['driver_approved'] ?? false,
                'driver_verification_status' => $user['driver_verification_status'] ?? 'none',
                'service_types' => json_encode($user['service_types'] ?? ['pick_drop', 'food', 'shop']),
                'is_super_admin' => $user['is_super_admin'] ?? false,
                'updated_at' => now(),
            ];

            if ($existing) {
                DB::table('profiles')->where('id', $existing->id)->update($profile);

                continue;
            }

            $userId = Str::uuid();
            DB::table('app_users')->insert([
                'id' => $userId,
                'email' => $email,
                'password_hash' => Hash::make(self::PASSWORD),
                'email_verified_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $profile['id'] = $userId;
            $profile['cash_owed'] = 0;
            $profile['cash_owed_limit'] = 500;
            $profile['created_at'] = now();

            DB::table('profiles')->insert($profile);
        }
    }
}
