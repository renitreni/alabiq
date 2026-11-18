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
        Schema::create('shop_order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('shop_order_id');
            $table->foreign('shop_order_id')->references('id')->on('shop_orders')->onDelete('cascade');
            $table->uuid('product_id')->nullable();
            $table->uuid('variant_id')->nullable();
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('total_price', 14, 2)->default(0);
            $table->timestampTz('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shop_order_items');
    }
};