<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Sampled driver GPS history (written from the Redis hot path by the
     * worker GPS sampling job; read for replay/heatmaps/PG fallback).
     * Mirrors backend/migrations/postgres/0009_gps_indexes.sql.
     */
    public function up(): void
    {
        Schema::create('driver_location_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('driver_id');
            $table->foreign('driver_id')->references('id')->on('profiles')->onDelete('cascade');
            $table->double('lat');
            $table->double('lng');
            $table->timestampTz('recorded_at');
            $table->double('accuracy')->nullable();
            $table->double('speed_kmh')->nullable();
            $table->double('heading')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            // Mirrors driver_location_history_driver_time / _time (0009)
            $table->index(['driver_id', 'recorded_at'], 'dlh_driver_time');
            $table->index('recorded_at', 'dlh_time');
        });

        DB::statement('ALTER TABLE driver_location_history ADD CONSTRAINT dlh_lat_check CHECK (lat BETWEEN -90 AND 90)');
        DB::statement('ALTER TABLE driver_location_history ADD CONSTRAINT dlh_lng_check CHECK (lng BETWEEN -180 AND 180)');
        DB::statement('ALTER TABLE driver_location_history ADD CONSTRAINT dlh_accuracy_check CHECK (accuracy IS NULL OR accuracy >= 0)');
        DB::statement('ALTER TABLE driver_location_history ADD CONSTRAINT dlh_speed_kmh_check CHECK (speed_kmh IS NULL OR speed_kmh >= 0)');
        DB::statement('ALTER TABLE driver_location_history ADD CONSTRAINT dlh_heading_check CHECK (heading IS NULL OR (heading >= 0 AND heading < 360))');
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_location_history');
    }
};
