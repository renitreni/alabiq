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
        Schema::create('password_reset_flows', function (Blueprint $table) {
            $table->char('state_hash', 64)->primary();
            $table->uuid('user_id');
            $table->foreign('user_id')->references('id')->on('app_users')->onDelete('cascade');
            $table->timestampTz('expires_at');
            $table->timestampTz('consumed_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index('expires_at');
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->char('token_hash', 64)->primary();
            $table->uuid('user_id');
            $table->foreign('user_id')->references('id')->on('app_users')->onDelete('cascade');
            $table->timestampTz('expires_at');
            $table->timestampTz('consumed_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index('expires_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('password_reset_flows');
    }
};