<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RequireMerchant
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::guard('api')->user();

        if (!$user || (!$user->hasRole('merchant') && !$user->hasRole('admin'))) {
            return response()->json(['error' => 'Business owner access required'], 403);
        }

        return $next($request);
    }
}