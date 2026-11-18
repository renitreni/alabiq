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
        // Partner credentials
        Schema::create('partner_credentials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100);
            $table->char('api_key_hash', 64)->unique();
            $table->timestampTz('expires_at')->nullable();
            $table->timestampTz('revoked_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        // Partner webhook endpoints
        Schema::create('partner_webhook_endpoints', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('credential_id');
            $table->foreign('credential_id')->references('id')->on('partner_credentials')->onDelete('cascade');
            $table->text('url');
            $table->json('events')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        // Partner webhook deliveries
        Schema::create('partner_webhook_deliveries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('endpoint_id');
            $table->foreign('endpoint_id')->references('id')->on('partner_webhook_endpoints')->onDelete('cascade');
            $table->string('event_type', 50);
            $table->uuid('delivery_id')->nullable();
            $table->text('payload_sha256')->nullable();
            $table->json('payload')->nullable();
            $table->integer('attempt')->default(0);
            $table->integer('status')->nullable();
            $table->text('error')->nullable();
            $table->boolean('completed')->default(false);
            $table->timestampTz('processed_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });

        // Delivery quotes
        Schema::create('delivery_quotes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('credential_id');
            $table->foreign('credential_id')->references('id')->on('partner_credentials')->onDelete('cascade');
            $table->string('external_order_id', 100);
            $table->decimal('dropoff_lat', 10, 8);
            $table->decimal('dropoff_lng', 11, 8);
            $table->text('dropoff_address');
            $table->text('dropoff_instructions')->nullable();
            $table->decimal('distance_km', 10, 2)->nullable();
            $table->decimal('duration_min', 10, 2)->nullable();
            $table->decimal('price_minor', 14, 2)->nullable();
            $table->string('currency', 3)->default('SAR');
            $table->string('status', 20)->default('pending');
            $table->timestampTz('expires_at');
            $table->timestampTz('created_at')->useCurrent();
        });

        // Partner deliveries
        Schema::create('partner_deliveries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('credential_id');
            $table->foreign('credential_id')->references('id')->on('partner_credentials')->onDelete('cascade');
            $table->uuid('quote_id');
            $table->foreign('quote_id')->references('id')->on('delivery_quotes')->onDelete('cascade');
            $table->string('external_order_id', 100);
            $table->json('customer')->nullable();
            $table->json('dropoff')->nullable();
            $table->json('items')->nullable();
            $table->json('merchandise_total')->nullable();
            $table->json('external_payment')->nullable();
            $table->string('preparation_status', 20)->default('accepted');
            $table->string('tracking_token', 100)->nullable();
            $table->uuid('driver_id')->nullable();
            $table->foreign('driver_id')->references('id')->on('profiles')->onDelete('set null');
            $table->string('status', 30)->default('created');
            $table->timestampTz('picked_up_at')->nullable();
            $table->timestampTz('delivered_at')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        DB::statement("ALTER TABLE partner_deliveries ADD CONSTRAINT partner_deliveries_status_check CHECK (status IN ('created','assigned','picked_up','delivered','cancelled'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('partner_deliveries');
        Schema::dropIfExists('delivery_quotes');
        Schema::dropIfExists('partner_webhook_deliveries');
        Schema::dropIfExists('partner_webhook_endpoints');
        Schema::dropIfExists('partner_credentials');
    }
};