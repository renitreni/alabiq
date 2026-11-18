<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Admin login events
        Schema::create('admin_login_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('profile_id')->nullable();
            $table->foreign('profile_id')->references('id')->on('profiles')->onDelete('set null');
            $table->text('email');
            $table->text('role');
            $table->text('ip')->nullable();
            $table->text('user_agent')->nullable();
            $table->timestampTz('occurred_at')->useCurrent();
        });

        // Error logs
        Schema::create('error_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->timestampTz('occurred_at')->useCurrent();
            $table->string('severity', 20)->default('error');
            $table->text('label');
            $table->text('message');
            $table->text('error_name')->nullable();
            $table->text('stack')->nullable();
            $table->text('request_id')->nullable();
            $table->text('method')->nullable();
            $table->text('path')->nullable();
            $table->integer('status_code')->nullable();
            $table->text('ip')->nullable();
            $table->text('user_agent')->nullable();
            $table->uuid('user_id')->nullable();
            $table->foreign('user_id')->references('id')->on('profiles')->onDelete('set null');
            $table->text('user_email')->nullable();
            $table->text('user_role')->nullable();
            $table->text('fingerprint')->nullable();
            $table->integer('suppressed_count')->default(0);
            $table->timestampTz('resolved_at')->nullable();
            $table->uuid('resolved_by')->nullable();
            $table->foreign('resolved_by')->references('id')->on('profiles')->onDelete('set null');
        });

        // App settings
        Schema::create('app_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value');
            $table->timestampTz('updated_at')->useCurrent();
            $table->uuid('updated_by')->nullable();
            $table->foreign('updated_by')->references('id')->on('profiles')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('app_settings');
        Schema::dropIfExists('error_logs');
        Schema::dropIfExists('admin_login_events');
    }
};