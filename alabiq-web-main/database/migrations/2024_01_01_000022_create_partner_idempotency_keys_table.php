<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Durable partner idempotency keys (survive restarts; replay encrypted
     * responses). Mirrors backend/migrations/postgres/0008_partner_api.sql.
     * Load-bearing for the partner API create/quote/cancel path.
     */
    public function up(): void
    {
        $isPg = Schema::getConnection()->getDriverName() === 'pgsql';

        Schema::create('partner_idempotency_keys', function (Blueprint $table) {
            $table->uuid('credential_id');
            $table->string('operation', 20);
            // 128 chars keeps the composite PK within MySQL/MariaDB index limits
            $table->string('key', 128);
            $table->text('request_hash');
            $table->string('state', 20)->default('in_progress');
            $table->integer('http_status')->nullable();
            $table->binary('idempotency_response_encrypted')->nullable();
            $table->uuid('resource_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('expires_at');

            $table->primary(['credential_id', 'operation', 'key']);
            $table->foreign('credential_id')->references('id')->on('partner_credentials')->onDelete('cascade');
        });

        DB::statement("ALTER TABLE partner_idempotency_keys ADD CONSTRAINT pik_operation_check CHECK (operation IN ('quote','create','cancel','preparation','rotate_tracking'))");
        DB::statement("ALTER TABLE partner_idempotency_keys ADD CONSTRAINT pik_state_check CHECK (state IN ('in_progress','completed','failed_retryable'))");

        if ($isPg) {
            DB::statement("CREATE INDEX partner_idempotency_expires ON partner_idempotency_keys (expires_at) WHERE state = 'in_progress'");
        } else {
            // No partial indexes on MySQL/MariaDB; plain index for cleanup queries
            Schema::table('partner_idempotency_keys', function (Blueprint $table) {
                $table->index('expires_at', 'partner_idempotency_expires');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('partner_idempotency_keys');
    }
};
