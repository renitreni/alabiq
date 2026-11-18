<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AdminSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $adminEmails = array_filter(
            array_map('trim', explode(',', env('ADMIN_EMAILS', '')))
        );

        foreach ($adminEmails as $email) {
            $email = strtolower($email);

            // Check if user exists
            $existing = DB::table('app_users')->whereRaw('LOWER(email) = ?', [$email])->first();

            if ($existing) {
                // Update profile to admin
                DB::table('profiles')
                    ->where('id', $existing->id)
                    ->update([
                        'role' => 'admin',
                        'is_super_admin' => true,
                        'updated_at' => now(),
                    ]);
                continue;
            }

            // Create admin user
            $userId = Str::uuid();
            DB::table('app_users')->insert([
                'id' => $userId,
                'email' => $email,
                'password_hash' => Hash::make(Str::random(16)), // Random password, will need reset
                'email_verified_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('profiles')->insert([
                'id' => $userId,
                'email' => $email,
                'role' => 'admin',
                'is_super_admin' => true,
                'service_types' => json_encode(['pick_drop', 'food', 'shop']),
                'cash_owed' => 0,
                'cash_owed_limit' => 500,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}