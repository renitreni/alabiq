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
        Schema::create('payment_proofs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('booking_id')->nullable();
            $table->foreign('booking_id')->references('id')->on('bookings')->onDelete('set null');
            $table->uuid('order_id')->nullable();
            $table->foreign('order_id')->references('id')->on('orders')->onDelete('set null');
            $table->uuid('shop_order_id')->nullable();
            $table->foreign('shop_order_id')->references('id')->on('shop_orders')->onDelete('set null');
            $table->text('path');
            $table->text('file_name');
            $table->text('mime_type');
            $table->bigInteger('size_bytes')->default(0);
            $table->text('reference')->nullable();
            $table->string('status', 20)->default('pending');
            $table->timestampTz('verified_at')->nullable();
            $table->uuid('verified_by')->nullable();
            $table->timestampTz('rejected_at')->nullable();
            $table->uuid('rejected_by')->nullable();
            $table->text('reject_reason')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->foreign('verified_by')->references('id')->on('profiles')->onDelete('set null');
            $table->foreign('rejected_by')->references('id')->on('profiles')->onDelete('set null');
        });

        DB::statement("ALTER TABLE payment_proofs ADD CONSTRAINT payment_proofs_status_check CHECK (status IN ('pending','verified','rejected'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payment_proofs');
    }
};