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
        Schema::create('orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('order_code', 30)->unique();
            $table->uuid('user_id')->nullable();
            $table->foreign('user_id')->references('id')->on('profiles')->onDelete('set null');
            $table->uuid('merchant_id')->nullable();
            $table->foreign('merchant_id')->references('id')->on('merchants')->onDelete('set null');
            $table->uuid('driver_id')->nullable();
            $table->foreign('driver_id')->references('id')->on('profiles')->onDelete('set null');
            $table->string('status', 30)->default('pending');
            $table->decimal('delivery_lat', 10, 8)->nullable();
            $table->decimal('delivery_lng', 11, 8)->nullable();
            $table->text('delivery_address')->nullable();
            $table->text('delivery_street')->nullable();
            $table->text('delivery_building')->nullable();
            $table->text('contact_phone')->nullable();
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('delivery_fee', 14, 2)->default(0);
            $table->decimal('platform_fee', 14, 2)->default(0);
            $table->decimal('vat_amount', 14, 2)->default(0);
            $table->decimal('total_amount', 14, 2)->default(0);
            $table->string('payment_method', 20)->nullable();
            $table->string('payment_status', 20)->default('pending');
            $table->text('payment_proof_path')->nullable();
            $table->text('payment_reference')->nullable();
            $table->text('notes')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->uuid('cancelled_by')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->timestampTz('accepted_at')->nullable();
            $table->timestampTz('preparing_at')->nullable();
            $table->timestampTz('ready_at')->nullable();
            $table->timestampTz('picked_up_at')->nullable();
            $table->timestampTz('delivered_at')->nullable();
            $table->decimal('distance_km', 10, 2)->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->foreign('cancelled_by')->references('id')->on('profiles')->onDelete('set null');
        });

        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','accepted','preparing','ready','out_for_delivery','delivered','cancelled'))");
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('stcpay','tap','cash'))");
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('pending','paid','failed','refunded'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};