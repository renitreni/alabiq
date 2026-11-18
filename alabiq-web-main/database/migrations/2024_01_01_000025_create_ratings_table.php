<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Per-order customer ratings (food vertical; one rating per order).
     * Mirrors backend/migrations/postgres/0001_schema.sql (ratings) — was
     * missing from the Laravel mirror, which broke /api/food/restaurants.
     */
    public function up(): void
    {
        Schema::create('ratings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('order_id')->nullable()->unique();
            $table->foreign('order_id')->references('id')->on('orders')->onDelete('set null');
            $table->uuid('customer_id')->nullable();
            $table->foreign('customer_id')->references('id')->on('profiles')->onDelete('set null');
            $table->uuid('merchant_id')->nullable();
            $table->foreign('merchant_id')->references('id')->on('merchants')->onDelete('set null');
            $table->smallInteger('food_rating');
            $table->text('comment')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });

        DB::statement('ALTER TABLE ratings ADD CONSTRAINT ratings_food_rating_check CHECK (food_rating BETWEEN 1 AND 5)');
    }

    public function down(): void
    {
        Schema::dropIfExists('ratings');
    }
};
