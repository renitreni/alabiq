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
        Schema::create('bookings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('booking_code', 30)->unique();
            $table->uuid('user_id')->nullable();
            $table->foreign('user_id')->references('id')->on('profiles')->onDelete('set null');
            $table->uuid('driver_id')->nullable();
            $table->foreign('driver_id')->references('id')->on('profiles')->onDelete('set null');
            $table->string('status', 30)->default('requested');
            $table->string('service_type', 20)->default('pick_drop');
            $table->decimal('pickup_lat', 10, 8)->nullable();
            $table->decimal('pickup_lng', 11, 8)->nullable();
            $table->text('pickup_address')->nullable();
            $table->text('pickup_street')->nullable();
            $table->text('pickup_building')->nullable();
            $table->decimal('dropoff_lat', 10, 8)->nullable();
            $table->decimal('dropoff_lng', 11, 8)->nullable();
            $table->text('dropoff_address')->nullable();
            $table->text('dropoff_street')->nullable();
            $table->text('dropoff_building')->nullable();
            $table->text('passenger_name')->nullable();
            $table->text('passenger_mobile')->nullable();
            $table->text('passenger_whatsapp')->nullable();
            $table->text('flight_number')->nullable();
            $table->text('terminal')->nullable();
            $table->timestampTz('scheduled_at')->nullable();
            $table->decimal('distance_km', 10, 2)->nullable();
            $table->integer('duration_min')->nullable();
            $table->decimal('fare_amount', 14, 2)->nullable();
            $table->decimal('platform_fee', 14, 2)->nullable();
            $table->decimal('driver_fee', 14, 2)->nullable();
            $table->decimal('vat_amount', 14, 2)->nullable();
            $table->decimal('total_amount', 14, 2)->nullable();
            $table->string('payment_method', 20)->nullable();
            $table->string('payment_status', 20)->default('pending');
            $table->text('payment_proof_path')->nullable();
            $table->text('payment_reference')->nullable();
            $table->text('notes')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->uuid('cancelled_by')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->timestampTz('accepted_at')->nullable();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->foreign('cancelled_by')->references('id')->on('profiles')->onDelete('set null');
        });

        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('requested','offered','accepted','driver_en_route','arrived','in_progress','completed','cancelled'))");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_service_type_check CHECK (service_type IN ('pick_drop','food','shop'))");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('cash','stcpay','tap','external'))");
        DB::statement("ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN ('pending','paid','failed','refunded'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};