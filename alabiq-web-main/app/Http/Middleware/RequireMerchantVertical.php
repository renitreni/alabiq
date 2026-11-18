<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RequireMerchantVertical
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string $vertical): Response
    {
        $user = Auth::guard('api')->user();

        if (!$user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        // Admin bypasses vertical check
        if ($user->hasRole('admin')) {
            return $next($request);
        }

        if (!$user->hasRole('merchant')) {
            return response()->json(['error' => 'Business owner access required'], 403);
        }

        $merchant = $user->merchant;

        if (!$merchant) {
            return response()->json(['error' => 'No business profile is linked to this account'], 404);
        }

        if ($merchant->vertical !== $vertical) {
            $message = $vertical === 'shop'
                ? 'This account manages a restaurant, not a store'
                : 'This account manages a store, not a restaurant';
            return response()->json(['error' => $message], 403);
        }

        // Attach merchant to request for controllers
        $request->merge(['merchant' => $merchant]);

        return $next($request);
    }
}