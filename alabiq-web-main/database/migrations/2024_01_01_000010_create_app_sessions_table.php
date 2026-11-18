<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('app_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->char('token_hash', 64)->unique();
            $table->uuid('user_id');
            $table->foreign('user_id')->references('id')->on('app_users')->onDelete('cascade');
            $table->timestampTz('last_seen_at')->useCurrent();
            $table->timestampTz('idle_expires_at');
            $table->timestampTz('absolute_expires_at');
            $table->timestampTz('revoked_at')->nullable();
            $table->text('user_agent')->nullable();
            $table->ipAddress('ip')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index('user_id');
            $table->index(['idle_expires_at', 'absolute_expires_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('app_sessions');
    }
};