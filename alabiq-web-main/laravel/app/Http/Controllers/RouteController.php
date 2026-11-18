<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

class RouteController extends Controller
{
    protected string $mapboxToken;

    public function __construct()
    {
        $this->mapboxToken = config('services.mapbox.access_token', '');
    }

    /**
     * GET /api/route
     */
    public function computeRoute(Request $request): JsonResponse
    {
        $from = $this->parseLatLng($request->query('from'));
        $to = $this->parseLatLng($request->query('to'));

        if (!$from || !$to) {
            return response()->json(['error' => 'from and to are required as "lat,lng"'], 400);
        }

        if (!$this->mapboxToken) {
            return response()->json(['error' => 'Routing service not configured'], 502);
        }

        try {
            $response = Http::timeout(10)->get("{$this->mapboxBase}/directions/v5/mapbox/driving/{$from['lng']},{$from['lat']};{$to['lng']},{$to['lat']}", [
                'access_token' => $this->mapboxToken,
                'geometries' => 'polyline',
                'overview' => 'full',
                'steps' => 'false',
            ]);

            if (!$response->ok()) {
                return response()->json(['error' => 'Routing service unavailable'], 502);
            }

            $data = $response->json();
            $route = ($data['routes'] ?? [])[0] ?? null;

            if (!$route) {
                return response()->json(['error' => 'No route found'], 404);
            }

            return response()->json([
                'encodedPolyline' => $route['geometry'] ?? '',
                'distanceMeters' => $route['distance'] ?? 0,
                'duration' => $route['duration'] ?? 0,
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Routing service unavailable'], 502);
        }
    }

    protected function parseLatLng(?string $value): ?array
    {
        if (!$value) return null;
        $parts = explode(',', $value);
        if (count($parts) !== 2) return null;

        $lat = (float)$parts[0];
        $lng = (float)$parts[1];

        if (!is_finite($lat) || !is_finite($lng)) return null;

        return ['lat' => $lat, 'lng' => $lng];
    }
}