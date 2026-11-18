<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ReferenceDataSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Insert default app settings
        DB::table('app_settings')->upsert([
            ['key' => 'max_distance_km', 'value' => json_encode(null), 'updated_at' => now()],
            ['key' => 'stcpay_enabled', 'value' => json_encode(true), 'updated_at' => now()],
        ], ['key'], ['value', 'updated_at']);
    }
}