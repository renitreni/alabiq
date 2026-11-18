<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class PartnerAuth
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Partner API uses API key authentication
        $apiKey = $request->header('X-Partner-Api-Key') ?? $request->bearerToken();

        if (!$apiKey) {
            return response()->json(['error' => 'Partner API key required'], 401);
        }

        // Look up the credential
        $credential = \App\Models\PartnerCredential::where('api_key_hash', hash('sha256', $apiKey))
            ->where('revoked_at', null)
            ->where(function ($query) {
                $query->whereNull('expires_at')
                    ->orWhere('expires_at', '>', now());
            })
            ->first();

        if (!$credential) {
            return response()->json(['error' => 'Invalid or expired API key'], 401);
        }

        // Attach credential to request
        $request->merge(['partner_credential' => $credential]);

        return $next($request);
    }
}