<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class HealthController extends Controller
{
    /**
     * GET /api/health
     */
    public function index(): JsonResponse
    {
        $checks = [
            'db' => 'unknown',
            'redis' => 'unknown',
            'worker' => 'unknown',
        ];

        // PostgreSQL
        try {
            DB::connection()->getPdo();
            $checks['db'] = 'connected';
        } catch (\Exception $e) {
            $checks['db'] = 'error';
        }

        // Redis
        try {
            Redis::ping();
            $checks['redis'] = 'connected';
        } catch (\Exception $e) {
            $checks['redis'] = 'error';
        }

        // Worker (check if background_jobs table has recent activity)
        try {
            $active = DB::table('background_jobs')
                ->whereNotNull('lease_owner')
                ->where('lease_expires_at', '>', now())
                ->exists();
            $checks['worker'] = $active ? 'active' : 'idle';
        } catch (\Exception $e) {
            $checks['worker'] = 'error';
        }

        $allHealthy = $checks['db'] === 'connected' &&
            ($checks['redis'] === 'connected' || $checks['redis'] === 'not_configured');

        $statusCode = $allHealthy ? 200 : 503;

        return response()->json([
            'status' => $allHealthy ? 'ok' : 'degraded',
            'apiVersion' => config('app.version', '1.0.0'),
            'checks' => $checks,
            'time' => now()->toISOString(),
        ], $statusCode);
    }

    /**
     * Health check for Docker healthcheck command.
     */
    public function check(): JsonResponse
    {
        try {
            DB::connection()->getPdo();
            return response()->json(['status' => 'healthy']);
        } catch (\Exception $e) {
            return response()->json(['status' => 'unhealthy'], 503);
        }
    }
}