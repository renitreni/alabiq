<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Enable pgcrypto extension (schema is a Supabase-ism; create it so fresh
        // databases work — IF NOT EXISTS keeps existing deployments untouched)
        DB::statement('CREATE SCHEMA IF NOT EXISTS extensions');
        DB::statement('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions');

        Schema::create('app_users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->text('email')->unique();
            $table->text('password_hash');
            $table->timestampTz('email_verified_at')->nullable();
            $table->timestampTz('disabled_at')->nullable();
            $table->timestampTz('last_login_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        // Create index for case-insensitive email lookup
        DB::statement('CREATE UNIQUE INDEX app_users_email_lower_unique ON app_users (LOWER(email))');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('app_users');
    }
};