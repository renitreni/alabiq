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
        Schema::create('merchants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('owner_id')->nullable();
            $table->unique('owner_id');
            $table->foreign('owner_id')->references('id')->on('profiles')->onDelete('set null');
            $table->string('vertical', 10)->default('food');
            $table->text('name');
            $table->text('cuisine_type')->nullable();
            $table->text('description')->nullable();
            $table->text('logo_url')->nullable();
            $table->text('address')->nullable();
            $table->text('street')->nullable();
            $table->text('building_number')->nullable();
            $table->decimal('lat', 10, 8)->nullable();
            $table->decimal('lng', 11, 8)->nullable();
            $table->decimal('service_radius_km', 10, 2)->default(15);
            $table->boolean('is_active')->default(false);
            $table->string('status', 20)->default('active');
            $table->boolean('accepting_orders')->default(true);
            $table->decimal('credit_limit', 14, 2)->default(500);
            $table->decimal('credit_used', 14, 2)->default(0);
            $table->boolean('is_featured')->default(false);
            $table->text('badge')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });

        DB::statement("ALTER TABLE merchants ADD CONSTRAINT merchants_vertical_check CHECK (vertical IN ('food','shop'))");
        DB::statement("ALTER TABLE merchants ADD CONSTRAINT merchants_status_check CHECK (status IN ('active','suspended','pending','rejected'))");
        DB::statement("ALTER TABLE merchants ADD CONSTRAINT merchants_lat_check CHECK (lat BETWEEN -90 AND 90)");
        DB::statement("ALTER TABLE merchants ADD CONSTRAINT merchants_lng_check CHECK (lng BETWEEN -180 AND 180)");
        DB::statement("ALTER TABLE merchants ADD CONSTRAINT merchants_service_radius_km_check CHECK (service_radius_km > 0)");
        DB::statement("ALTER TABLE merchants ADD CONSTRAINT merchants_credit_limit_check CHECK (credit_limit >= 0)");
        DB::statement("ALTER TABLE merchants ADD CONSTRAINT merchants_credit_used_check CHECK (credit_used >= 0)");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('merchants');
    }
};