<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Partner-API order extensions.
     * Mirrors backend/migrations/postgres/0008_partner_api.sql (orders section)
     * and 0010_partner_api_fixes.sql (payment_method 'external').
     */
    public function up(): void
    {
        $isPg = Schema::getConnection()->getDriverName() === 'pgsql';

        Schema::table('orders', function (Blueprint $table) {
            $table->string('source', 30)->default('alabiq_marketplace')->after('driver_id');
            $table->text('external_order_id')->nullable()->after('source');
            $table->string('payment_collection', 20)->default('alabiq')->after('external_order_id');
            $table->text('external_payment_reference')->nullable()->after('payment_collection');
            // bytea on pgsql; blob on mysql. Encrypted idempotency replay body.
            $table->binary('idempotency_response_encrypted')->nullable()->after('external_payment_reference');
            $table->char('tracking_token_hash', 64)->nullable()->after('idempotency_response_encrypted');
            $table->timestampTz('tracking_token_expires_at')->nullable()->after('tracking_token_hash');
            $table->timestampTz('tracking_token_revoked_at')->nullable()->after('tracking_token_expires_at');
        });

        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_source_check CHECK (source IN ('alabiq_marketplace','restaurant_partner'))");
        DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_collection_check CHECK (payment_collection IN ('alabiq','restaurant'))");

        // 0010: extend payment_method check with 'external' (restaurant collects).
        // Superset of the old ('stcpay','tap','cash') constraint.
        if ($isPg) {
            DB::statement('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check');
            DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('stcpay','tap','cash','external')) NOT VALID");
            DB::statement('ALTER TABLE orders VALIDATE CONSTRAINT orders_payment_method_check');
        } else {
            // MySQL 8.0.19+ / MariaDB syntax for dropping a named CHECK
            DB::statement('ALTER TABLE orders DROP CHECK orders_payment_method_check');
            DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('stcpay','tap','cash','external'))");
        }

        // Tenant-scoped uniqueness for partner-sourced orders.
        if ($isPg) {
            DB::statement("CREATE UNIQUE INDEX orders_partner_external ON orders (merchant_id, external_order_id) WHERE source = 'restaurant_partner' AND external_order_id IS NOT NULL");
        } else {
            // MySQL/MariaDB have no partial indexes; NULLs are distinct in unique
            // indexes so marketplace orders (NULL external_order_id) still pass.
            Schema::table('orders', function (Blueprint $table) {
                $table->unique(['merchant_id', 'external_order_id'], 'orders_partner_external');
            });
        }
    }

    public function down(): void
    {
        $isPg = Schema::getConnection()->getDriverName() === 'pgsql';

        if ($isPg) {
            DB::statement('DROP INDEX IF EXISTS orders_partner_external');
        } else {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropUnique('orders_partner_external');
            });
        }

        if ($isPg) {
            DB::statement('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check');
            DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('stcpay','tap','cash')) NOT VALID");
            DB::statement('ALTER TABLE orders VALIDATE CONSTRAINT orders_payment_method_check');
        } else {
            DB::statement('ALTER TABLE orders DROP CHECK orders_payment_method_check');
            DB::statement("ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('stcpay','tap','cash'))");
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'source',
                'external_order_id',
                'payment_collection',
                'external_payment_reference',
                'idempotency_response_encrypted',
                'tracking_token_hash',
                'tracking_token_expires_at',
                'tracking_token_revoked_at',
            ]);
        });
    }
};
