<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class LocationsController extends Controller
{
    protected string $mapboxToken;
    protected string $mapboxBase = 'https://api.mapbox.com';

    protected array $nearbyCategories = [
        'restaurant', 'cafe', 'gas_station', 'pharmacy', 'hospital',
        'bank', 'atm', 'parking', 'supermarket', 'convenience_store',
        'mall', 'lodging',
    ];

    public function __construct()
    {
        $this->mapboxToken = config('services.mapbox.access_token', '');
    }

    public function search(Request $request): JsonResponse
    {
        $q = $request->query('q', '');
        $lat = $request->query('lat');
        $lng = $request->query('lng');
        $token = $request->query('token', Str::uuid());

        if (!$q) {
            return response()->json(['error' => 'Query parameter q is required'], 400);
        }

        if (!$this->mapboxToken) {
            return response()->json(['error' => 'Location search is not configured'], 502);
        }

        $cacheKey = "loc:search:{$token}:{$q}:{$lat}:{$lng}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return response()->json($cached);
        }

        try {
            $params = [
                'q' => $q,
                'access_token' => $this->mapboxToken,
                'session_token' => $token,
                'limit' => 10,
                'language' => 'en',
            ];

            if ($lat && $lng) {
                $params['proximity'] = "{$lng},{$lat}";
            }

            $response = Http::timeout(10)->get("{$this->mapboxBase}/search/searchbox/v1/suggest", $params);

            if (!$response->ok()) {
                return response()->json(['error' => 'Location search failed'], 502);
            }

            $data = $response->json();
            $suggestions = array_map(function ($feature) {
                return [
                    'id' => $feature['id'] ?? '',
                    'text' => $feature['name'] ?? '',
                    'place_name' => $feature['full_address'] ?? $feature['name'] ?? '',
                ];
            }, $data['suggestions'] ?? []);

            $result = ['suggestions' => $suggestions];
            Cache::put($cacheKey, $result, 60);

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Location search failed'], 502);
        }
    }

    public function details(Request $request): JsonResponse
    {
        $id = $request->query('id', '');
        $token = $request->query('token', Str::uuid());

        if (!$id) {
            return response()->json(['error' => 'id is required'], 400);
        }

        if (!$this->mapboxToken) {
            return response()->json(['error' => 'Location details is not configured'], 502);
        }

        $cacheKey = "loc:details:{$id}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return response()->json($cached);
        }

        try {
            $response = Http::timeout(10)->get("{$this->mapboxBase}/search/searchbox/v1/retrieve/{$id}", [
                'access_token' => $this->mapboxToken,
                'session_token' => $token,
            ]);

            if (!$response->ok()) {
                return response()->json(['error' => 'Could not read this location'], 502);
            }

            $data = $response->json();
            $feature = ($data['features'] ?? [])[0] ?? null;

            if (!$feature) {
                return response()->json(['error' => 'Could not read this location'], 404);
            }

            $place = $this->featureToPlace($feature);
            $result = ['place' => $place];
            Cache::put($cacheKey, $result, 60);

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Could not read this location'], 502);
        }
    }

    public function reverse(Request $request): JsonResponse
    {
        $lat = $request->query('lat');
        $lng = $request->query('lng');

        if (!$lat || !$lng) {
            return response()->json(['error' => 'lat and lng are required'], 400);
        }

        if (!$this->mapboxToken) {
            return response()->json(['error' => 'Location reverse is not configured'], 502);
        }

        $lat = round((float)$lat, 4);
        $lng = round((float)$lng, 4);
        $cacheKey = "loc:reverse:{$lat}:{$lng}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return response()->json($cached);
        }

        try {
            $response = Http::timeout(10)->get("{$this->mapboxBase}/geocoding/v5/mapbox.places/{$lng},{$lat}.json", [
                'access_token' => $this->mapboxToken,
                'language' => 'en',
            ]);

            if (!$response->ok()) {
                return response()->json(['error' => 'Could not read address'], 502);
            }

            $data = $response->json();
            $place = $this->placeFromMapboxReverse($data['features'] ?? [], $lat, $lng);

            if (!$place) {
                return response()->json(['error' => 'No address found for this location'], 404);
            }

            $result = ['place' => $place];
            Cache::put($cacheKey, $result, 60);

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Could not read address'], 502);
        }
    }

    public function nearby(Request $request): JsonResponse
    {
        $lat = $request->query('lat');
        $lng = $request->query('lng');

        if (!$lat || !$lng) {
            return response()->json(['error' => 'lat and lng are required'], 400);
        }

        if (!$this->mapboxToken) {
            return response()->json(['error' => 'Nearby places is not configured'], 502);
        }

        $lat = round((float)$lat, 3);
        $lng = round((float)$lng, 3);
        $cacheKey = "loc:nearby:{$lat}:{$lng}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return response()->json($cached);
        }

        try {
            $promises = [];
            foreach ($this->nearbyCategories as $category) {
                $promises[$category] = Http::timeout(10)->getAsync("{$this->mapboxBase}/search/searchbox/v1/category/{$category}", [
                    'access_token' => $this->mapboxToken,
                    'proximity' => "{$lng},{$lat}",
                    'language' => 'en',
                    'limit' => 10,
                ]);
            }

            $responses = Http::pool($promises);
            $seen = [];
            $places = [];

            foreach ($responses as $category => $response) {
                if (!$response->ok()) continue;

                $data = $response->json();
                foreach ($data['features'] ?? [] as $feature) {
                    $place = $this->featureToPlace($feature, $category);
                    if (!$place['lat'] || !$place['lng'] || !$place['id'] || isset($seen[$place['id']])) {
                        continue;
                    }
                    $seen[$place['id']] = true;
                    $places[] = $place;
                    if (count($places) >= 20) break 2;
                }
            }

            $result = ['places' => $places];
            Cache::put($cacheKey, $result, 60);

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Nearby places are temporarily unavailable'], 502);
        }
    }

    protected function featureToPlace(array $feature, ?string $category = null): array
    {
        $properties = $feature['properties'] ?? [];
        $geometry = $feature['geometry'] ?? [];
        $coords = $geometry['coordinates'] ?? [];

        return [
            'id' => $feature['id'] ?? '',
            'name' => $properties['name'] ?? '',
            'address' => $properties['full_address'] ?? $properties['address'] ?? '',
            'lat' => $coords[1] ?? null,
            'lng' => $coords[0] ?? null,
            'category' => $category ?? $properties['category'] ?? null,
        ];
    }

    protected function placeFromMapboxReverse(array $features, float $lat, float $lng): ?array
    {
        if (empty($features)) {
            return null;
        }

        $best = null;
        foreach ($features as $feature) {
            $props = $feature['properties'] ?? [];
            $placeType = $props['place_type'] ?? [];

            if (in_array('address', $placeType) || in_array('poi', $placeType)) {
                $best = $feature;
                break;
            }
            if (!$best && in_array('street', $placeType)) {
                $best = $feature;
            }
        }

        $best = $best ?? $features[0];
        $props = $best['properties'] ?? [];
        $geometry = $best['geometry'] ?? [];
        $coords = $geometry['coordinates'] ?? [];

        return [
            'id' => $best['id'] ?? '',
            'name' => $props['name'] ?? '',
            'address' => $props['full_address'] ?? $props['address'] ?? '',
            'lat' => $coords[1] ?? $lat,
            'lng' => $coords[0] ?? $lng,
            'category' => $props['category'] ?? null,
        ];
    }
}
