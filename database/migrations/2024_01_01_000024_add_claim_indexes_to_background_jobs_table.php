<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Worker claim-pattern parity with Express 0008/0009:
     *  - dedup_key column + unique index (kind, dedup_key) — dedup across
     *    restarts (NULLs are distinct in unique indexes on both drivers)
     *  - active-lease index (lease_owner, lease_expires_at) — renewal/cleanup
     * The main claim index already exists as bg_jobs_poll_idx (000012).
     */
    public function up(): void
    {
        Schema::table('background_jobs', function (Blueprint $table) {
            $table->string('dedup_key', 100)->nullable()->after('kind');
        });

        DB::statement('CREATE UNIQUE INDEX background_jobs_dedup ON background_jobs (kind, dedup_key)');
        DB::statement('CREATE INDEX background_jobs_active_lease ON background_jobs (lease_owner, lease_expires_at)');
    }

    public function down(): void
    {
        Schema::table('background_jobs', function (Blueprint $table) {
            $table->dropIndex('background_jobs_dedup');
            $table->dropIndex('background_jobs_active_lease');
            $table->dropColumn('dedup_key');
        });
    }
};
