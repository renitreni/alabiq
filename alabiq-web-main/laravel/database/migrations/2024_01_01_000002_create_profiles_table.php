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
        Schema::create('profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreign('id')->references('id')->on('app_users')->onDelete('cascade');
            $table->text('email')->nullable();
            $table->string('full_name', 120)->nullable();
            $table->string('role', 20)->default('passenger');
            $table->date('date_of_birth')->nullable();
            $table->text('gender')->nullable();
            $table->text('national_id')->nullable();
            $table->text('mobile_number')->nullable();
            $table->text('whatsapp_number')->nullable();
            $table->text('vehicle_type')->nullable();
            $table->text('vehicle_plate')->nullable();
            $table->boolean('driver_approved')->default(false);
            $table->string('driver_verification_status', 20)->default('none');
            $table->json('service_types')->default(['pick_drop', 'food', 'shop']);
            $table->text('avatar_url')->nullable();
            $table->text('address')->nullable();
            $table->decimal('cash_owed', 14, 2)->default(0);
            $table->decimal('cash_owed_limit', 14, 2)->default(500);
            $table->boolean('is_super_admin')->default(false);
            $table->timestampTz('disabled_at')->nullable();
            $table->uuid('disabled_by')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->foreign('disabled_by')->references('id')->on('profiles')->onDelete('set null');
        });

        // Add check constraints
        DB::statement("ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('passenger','driver','merchant','admin'))");
        DB::statement("ALTER TABLE profiles ADD CONSTRAINT profiles_driver_verification_status_check CHECK (driver_verification_status IN ('none','pending','approved','rejected'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('profiles');
    }
};