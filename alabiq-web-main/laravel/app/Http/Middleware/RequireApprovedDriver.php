<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RequireApprovedDriver
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::guard('api')->user();

        if (!$user || (!$user->hasRole('driver') && !$user->hasRole('admin'))) {
            return response()->json(['error' => 'Driver access required'], 403);
        }

        // Admin bypasses approval check
        if ($user->hasRole('admin')) {
            return $next($request);
        }

        $profile = $user->profile;

        if (!$profile || !$profile->driver_approved) {
            return response()->json(['error' => 'Your driver account is pending admin approval'], 403);
        }

        return $next($request);
    }
}