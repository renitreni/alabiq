<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class Idempotency
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Only apply to mutating requests
        if (!in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            return $next($request);
        }

        $key = $request->header('Idempotency-Key') ?? $request->input('idempotency_key');

        if (!$key) {
            return $next($request);
        }

        $cacheKey = "idempotency:{$key}";

        // Check if we've seen this key before
        if (Cache::has($cacheKey)) {
            $cached = Cache::get($cacheKey);
            return response()->json($cached['response'], $cached['status'])
                ->header('X-Idempotency-Replayed', 'true');
        }

        // Process the request
        $response = $next($request);

        // Store successful responses (2xx) for 24 hours
        if ($response->isSuccessful()) {
            Cache::put($cacheKey, [
                'response' => $response->getData(true),
                'status' => $response->getStatusCode(),
            ], 86400); // 24 hours
        }

        return $response;
    }
}