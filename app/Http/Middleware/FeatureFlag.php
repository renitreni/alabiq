<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class FeatureFlag
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        if (!config("alabiq.features.{$feature}_enabled")) {
            return response()->json(['error' => "The {$feature} is not open yet."], 503);
        }

        return $next($request);
    }
}