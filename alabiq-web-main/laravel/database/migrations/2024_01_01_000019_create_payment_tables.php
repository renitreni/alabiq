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
        // Saved payment methods (Tap)
        Schema::create('saved_payment_methods', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->foreign('user_id')->references('id')->on('profiles')->onDelete('cascade');
            $table->string('provider', 20)->default('tap');
            $table->text('gateway_customer_id');
            $table->text('gateway_card_id');
            $table->text('payment_agreement_id')->nullable();
            $table->text('brand')->nullable();
            $table->string('last4', 4);
            $table->smallInteger('exp_month')->nullable();
            $table->integer('exp_year')->nullable();
            $table->text('funding')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestampTz('consent_at')->useCurrent();
            $table->text('consent_reference')->nullable();
            $table->timestampTz('last_used_at')->nullable();
            $table->timestampTz('deleted_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['provider', 'gateway_customer_id']);
        });

        // Raw ALTER must run AFTER the table exists — statements inside the
        // Schema::create closure execute before the CREATE TABLE is emitted.
        DB::statement("ALTER TABLE saved_payment_methods ADD CONSTRAINT saved_payment_methods_default_check CHECK (NOT is_default OR deleted_at IS NULL)");

        // Payment customers (Tap)
        Schema::create('payment_customers', function (Blueprint $table) {
            $table->uuid('user_id')->primary();
            $table->foreign('user_id')->references('id')->on('profiles')->onDelete('cascade');
            $table->string('provider', 20)->default('tap');
            $table->text('gateway_customer_id');
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['provider', 'gateway_customer_id']);
        });

        // Webhook events (Tap)
        Schema::create('webhook_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('provider', 20);
            $table->string('event_type', 50)->nullable();
            $table->text('gateway_payment_id')->nullable();
            $table->boolean('signature_verified')->default(false);
            $table->boolean('verified_by_fetch')->default(false);
            $table->json('payload')->nullable();
            $table->text('payload_sha256')->nullable();
            $table->uuid('booking_id')->nullable();
            $table->foreign('booking_id')->references('id')->on('bookings')->onDelete('set null');
            $table->uuid('order_id')->nullable();
            $table->foreign('order_id')->references('id')->on('orders')->onDelete('set null');
            $table->uuid('shop_order_id')->nullable();
            $table->foreign('shop_order_id')->references('id')->on('shop_orders')->onDelete('set null');
            $table->timestampTz('processed_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });

        // Audit logs
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('actor_id')->nullable();
            $table->foreign('actor_id')->references('id')->on('profiles')->onDelete('set null');
            $table->text('action');
            $table->text('resource_type')->nullable();
            $table->text('resource_id')->nullable();
            $table->json('meta')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });

        // Driver documents
        Schema::create('driver_documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('driver_id');
            $table->foreign('driver_id')->references('id')->on('profiles')->onDelete('cascade');
            $table->string('document_type', 30);
            $table->text('path');
            $table->string('status', 20)->default('pending');
            $table->text('reject_reason')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->uuid('reviewed_by')->nullable();
            $table->foreign('reviewed_by')->references('id')->on('profiles')->onDelete('set null');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        DB::statement("ALTER TABLE driver_documents ADD CONSTRAINT driver_documents_status_check CHECK (status IN ('pending','approved','rejected'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('driver_documents');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('webhook_events');
        Schema::dropIfExists('payment_customers');
        Schema::dropIfExists('saved_payment_methods');
    }
};