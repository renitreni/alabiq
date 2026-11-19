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
        Schema::create('merchant_hours', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('merchant_id');
            $table->foreign('merchant_id')->references('id')->on('merchants')->onDelete('cascade');
            $table->smallInteger('weekday');
            $table->time('opens_at');
            $table->time('closes_at');
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['merchant_id', 'weekday', 'opens_at']);
        });

        DB::statement("ALTER TABLE merchant_hours ADD CONSTRAINT merchant_hours_weekday_check CHECK (weekday BETWEEN 0 AND 6)");
        DB::statement("ALTER TABLE merchant_hours ADD CONSTRAINT merchant_hours_opens_closes_check CHECK (opens_at <> closes_at)");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('merchant_hours');
    }
};