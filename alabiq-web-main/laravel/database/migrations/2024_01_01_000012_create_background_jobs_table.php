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
        Schema::create('background_jobs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('kind', 50);
            $table->json('payload')->nullable();
            $table->timestampTz('run_at')->useCurrent();
            $table->integer('max_attempts')->default(3);
            $table->integer('attempts')->default(0);
            $table->uuid('lease_owner')->nullable();
            $table->timestampTz('lease_expires_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->text('error')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['kind', 'completed_at', 'run_at', 'lease_owner', 'lease_expires_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('background_jobs');
    }
};