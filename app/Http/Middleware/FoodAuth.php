<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class FoodAuth
{
    /**
     * Handle an incoming request.
     *
     * This is optional auth - it attaches the user if authenticated but doesn't require it.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (Auth::guard('api')->check()) {
            $request->merge(['optional_user' => Auth::guard('api')->user()]);
        }

        return $next($request);
    }
}