<?php

namespace App\Http\Controllers\Food;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\MerchantHour;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RestaurantsController extends Controller
{
    // GET /api/food/restaurants?q=&cuisine=&featured=
    public function listRestaurants(Request $request): JsonResponse
    {
        try {
            $q = trim((string)$request->query('q', ''));
            $cuisine = trim((string)$request->query('cuisine', ''));
            $featuredOnly = $request->boolean('featured');

            $query = Merchant::query()
                ->where('vertical', 'food')
                ->where('is_active', true)
                ->where('status', 'active');

            if ($q) {
                // ILIKE is pgsql-only; MariaDB/MySQL LIKE is case-insensitive
                // under utf8mb4_general_ci (the shared-hosting collation).
                $like = Schema::getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
                $query->where(function ($qb) use ($q, $like) {
                    $qb->where('name', $like, "%{$q}%")
                        ->orWhere('address', $like, "%{$q}%")
                        ->orWhere('cuisine_type', $like, "%{$q}%");
                });
            }

            if ($cuisine) {
                $query->where('cuisine_type', $cuisine);
            }

            if ($featuredOnly) {
                $query->where('is_featured', true);
            }

            $merchants = $query->orderBy('is_featured', 'desc')
                ->orderBy('name')
                ->limit(100)
                ->get();

            $merchantIds = $merchants->pluck('id')->toArray();

            // Aggregated from the per-order `ratings` table (mirrors Express
            // storefrontRepository.ratings) — no Rating model/aggregate table.
            $ratings = DB::table('ratings')
                ->whereIn('merchant_id', $merchantIds)
                ->selectRaw('merchant_id, avg(food_rating) as rating, count(*) as review_count')
                ->groupBy('merchant_id')
                ->get()
                ->keyBy('merchant_id');

            $itemCounts = MenuItem::whereIn('merchant_id', $merchantIds)
                ->where('is_available', true)
                ->selectRaw('merchant_id, count(*) as item_count')
                ->groupBy('merchant_id')
                ->pluck('item_count', 'merchant_id');

            $hours = MerchantHour::whereIn('merchant_id', $merchantIds)
                ->orderBy('weekday')
                ->orderBy('opens_at')
                ->get()
                ->groupBy('merchant_id');

            $config = config('alabiq.food', []);
            $deliveryFee = $config['delivery_fee_sar'] ?? 5.00;
            $minOrder = $config['min_order_sar'] ?? 15.00;
            $maxDistanceKm = $config['max_distance_km'] ?? 15;

            $deliveryTerms = [
                'base_fee' => $deliveryFee,
                'surcharge_per_km' => $config['surcharge_per_km'] ?? 0.50,
                'max_distance_km' => $maxDistanceKm,
            ];

            $cuisines = Merchant::where('vertical', 'food')
                ->where('is_active', true)
                ->where('status', 'active')
                ->whereNotNull('cuisine_type')
                ->distinct()
                ->pluck('cuisine_type')
                ->filter()
                ->sort()
                ->values();

            return response()->json([
                'restaurants' => $merchants->map(function ($m) use ($ratings, $itemCounts, $hours, $deliveryFee, $minOrder) {
                    $rating = $ratings->get($m->id);
                    $itemCount = $itemCounts->get($m->id) ?? 0;
                    $merchantHours = $hours->get($m->id, collect());
                    $accepting = $m->accepting_orders ?? true;

                    $state = $this->publicHoursState($accepting, $merchantHours);

                    return [
                        'id' => $m->id,
                        'name' => $m->name,
                        'cuisine_type' => $m->cuisine_type,
                        'description' => $m->description,
                        'logo_url' => $m->logo_url,
                        'address' => $m->address,
                        'lat' => $m->lat,
                        'lng' => $m->lng,
                        'service_radius_km' => $m->service_radius_km,
                        'rating' => $rating ? (float)$rating->rating : null,
                        'review_count' => $rating ? (int)$rating->review_count : 0,
                        'item_count' => $itemCount,
                        'has_menu' => $itemCount > 0,
                        'accepting_orders' => $accepting,
                        'is_featured' => $m->is_featured,
                        'badge' => $m->badge,
                        'open_state' => $state['open_state'],
                        'next_change' => $state['next_change'],
                        'next_change_label' => $state['next_change_label'],
                    ];
                }),
                'cuisines' => $cuisines,
                'delivery_fee' => $deliveryFee,
                'delivery' => $deliveryTerms,
                'min_order' => $minOrder,
            ]);
        } catch (\Throwable $e) {
            \Log::error('listRestaurants error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    // GET /api/food/restaurants/{id}
    public function getRestaurant(Request $request, string $id): JsonResponse
    {
        try {
            $merchant = Merchant::where('id', $id)
                ->where('vertical', 'food')
                ->where('is_active', true)
                ->where('status', 'active')
                ->first();

            if (!$merchant) {
                return response()->json(['error' => 'Restaurant not found or no longer listed'], 404);
            }

            $merchantHours = MerchantHour::where('merchant_id', $id)
                ->orderBy('weekday')
                ->orderBy('opens_at')
                ->get();

            $accepting = $merchant->accepting_orders ?? true;
            $state = $this->publicHoursState($accepting, $merchantHours);

            $categories = MenuCategory::where('merchant_id', $id)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get();

            $items = MenuItem::where('merchant_id', $id)
                ->where('is_available', true)
                ->orderBy('category_id')
                ->orderBy('name')
                ->get();

            $config = config('alabiq.food', []);
            $deliveryFee = $config['delivery_fee_sar'] ?? 5.00;
            $maxDistanceKm = $config['max_distance_km'] ?? 15;
            $minOrder = $config['min_order_sar'] ?? 15.00;

            $deliveryTerms = [
                'base_fee' => $deliveryFee,
                'surcharge_per_km' => $config['surcharge_per_km'] ?? 0.50,
                'max_distance_km' => $maxDistanceKm,
            ];

            $publicMerchant = $merchant->toArray();
            unset($publicMerchant['vertical'], $publicMerchant['is_active'], $publicMerchant['status']);

            return response()->json([
                'restaurant' => array_merge($publicMerchant, $state),
                'categories' => $categories,
                'items' => $items,
                'delivery_fee' => $deliveryFee,
                'delivery' => $deliveryTerms,
                'min_order' => $minOrder,
            ]);
        } catch (\Throwable $e) {
            \Log::error('getRestaurant error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    protected function publicHoursState(bool $acceptingOrders, $hours): array
    {
        if (!$acceptingOrders) {
            return [
                'open_state' => 'closed',
                'next_change' => null,
                'next_change_label' => 'Currently not accepting orders',
            ];
        }

        if ($hours->isEmpty()) {
            return [
                'open_state' => 'open',
                'next_change' => null,
                'next_change_label' => 'Open (no hours set)',
            ];
        }

        $now = now();
        $dayOfWeek = (int)$now->format('w');
        $currentTime = $now->format('H:i:s');

        $openNow = false;
        $nextChange = null;
        $nextLabel = null;

        foreach ($hours as $hour) {
            $hourDay = (int)$hour->weekday;
            $openTime = $hour->opens_at;
            $closeTime = $hour->closes_at;

            if ($hourDay === $dayOfWeek) {
                if ($openTime <= $currentTime && $currentTime < $closeTime) {
                    $openNow = true;
                    $nextChange = $closeTime;
                    $nextLabel = 'Closes at';
                } elseif ($currentTime < $openTime && (!$nextChange || $openTime < $nextChange)) {
                    $nextChange = $openTime;
                    $nextLabel = 'Opens at';
                }
            }
        }

        if (!$openNow && !$nextChange) {
            for ($i = 1; $i <= 7; $i++) {
                $checkDay = ($dayOfWeek + $i) % 7;
                $dayHours = $hours->where('weekday', $checkDay);
                if ($dayHours->isNotEmpty()) {
                    $firstOpen = $dayHours->sortBy('opens_at')->first();
                    $nextChange = $firstOpen->opens_at;
                    $nextLabel = 'Opens ' . $this->dayName($checkDay) . ' at';
                    break;
                }
            }
        }

        return [
            'open_state' => $openNow ? 'open' : 'closed',
            'next_change' => $nextChange,
            'next_change_label' => $nextLabel,
        ];
    }

    protected function dayName(int $day): string
    {
        $days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return $days[$day] ?? '';
    }
}