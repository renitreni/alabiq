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
        // Shop categories
        Schema::create('shop_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('merchant_id');
            $table->foreign('merchant_id')->references('id')->on('merchants')->onDelete('cascade');
            $table->string('name', 120);
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        // Shop products
        Schema::create('shop_products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('merchant_id');
            $table->foreign('merchant_id')->references('id')->on('merchants')->onDelete('cascade');
            $table->uuid('category_id')->nullable();
            $table->foreign('category_id')->references('id')->on('shop_categories')->onDelete('set null');
            $table->string('name', 200);
            $table->text('description')->nullable();
            $table->text('brand')->nullable();
            $table->text('unit')->nullable();
            $table->integer('weight_grams')->nullable();
            $table->text('barcode')->nullable();
            $table->decimal('price', 14, 2);
            $table->decimal('net_price', 14, 2)->nullable();
            $table->text('image_url')->nullable();
            $table->integer('stock_quantity')->default(0);
            $table->integer('low_stock_threshold')->nullable();
            $table->boolean('track_stock')->default(true);
            $table->boolean('is_available')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        // Shop product variants
        Schema::create('shop_product_variants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_id');
            $table->foreign('product_id')->references('id')->on('shop_products')->onDelete('cascade');
            $table->text('sku')->nullable();
            $table->string('label', 120);
            $table->decimal('price', 14, 2)->nullable();
            $table->decimal('net_price', 14, 2)->nullable();
            $table->integer('stock_quantity')->default(0);
            $table->integer('sort_order')->default(0);
            $table->boolean('is_available')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        // Shop cart
        Schema::create('shop_carts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->foreign('user_id')->references('id')->on('profiles')->onDelete('cascade');
            $table->uuid('merchant_id')->nullable();
            $table->foreign('merchant_id')->references('id')->on('merchants')->onDelete('set null');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->unique('user_id');
        });

        Schema::create('shop_cart_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('cart_id');
            $table->foreign('cart_id')->references('id')->on('shop_carts')->onDelete('cascade');
            $table->uuid('product_id');
            $table->foreign('product_id')->references('id')->on('shop_products')->onDelete('cascade');
            $table->uuid('variant_id')->nullable();
            $table->foreign('variant_id')->references('id')->on('shop_product_variants')->onDelete('set null');
            $table->integer('quantity')->default(1);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        // Shop events
        Schema::create('shop_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('event_name', 60);
            $table->uuid('merchant_id')->nullable();
            $table->foreign('merchant_id')->references('id')->on('merchants')->onDelete('set null');
            $table->uuid('shop_order_id')->nullable();
            $table->foreign('shop_order_id')->references('id')->on('shop_orders')->onDelete('set null');
            $table->uuid('user_id')->nullable();
            $table->foreign('user_id')->references('id')->on('profiles')->onDelete('set null');
            $table->json('params')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shop_events');
        Schema::dropIfExists('shop_cart_items');
        Schema::dropIfExists('shop_carts');
        Schema::dropIfExists('shop_product_variants');
        Schema::dropIfExists('shop_products');
        Schema::dropIfExists('shop_categories');
    }
};