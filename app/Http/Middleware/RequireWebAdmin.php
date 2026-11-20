<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Session-guard counterpart of RequireAdmin for the Blade admin portal.
 * Unauthenticated or non-admin users are bounced to the web login page
 * instead of receiving a JSON 403.
 */
class RequireWebAdmin
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::guard('web')->user();

        if (! $user) {
            return redirect()->guest(route('admin.login'));
        }

        if (! $user->isAdmin()) {
            abort(403, 'Admin access required');
        }

        return $next($request);
    }
}
