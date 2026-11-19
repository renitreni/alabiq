<?php

namespace App\Http\Controllers\Shop;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Models\ShopCategory;
use App\Models\ShopProduct;
use App\Models\MerchantHour;
use App\Models\Rating;

class StoresController extends Controller
{
    // GET /api/shop/stores?q=&category=&featured=
    public function listStores(Request $request): JsonResponse
    {
        try {
            $q = trim((string)$request->query('q', ''));
            $category = trim((string)$request->query('category', ''));
            $featuredOnly = $request->boolean('featured');

            $query = Merchant::query()
                ->where('vertical', 'shop')
                ->where('is_active', true)
                ->where('status', 'active');

            if ($q) {
                $query->where(function ($qb) use ($q) {
                    $qb->where('name', 'ILIKE', "%{$q}%")
                        ->orWhere('address', 'ILIKE', "%{$q}%");
                });
            }

            if ($category) {
                $query->where('cuisine_type', $category);
            }

            if ($featuredOnly) {
                $query->where('is_featured', true);
            }

            $merchants = $query->orderBy('is_featured', 'desc')
                ->orderBy('name')
                ->limit(100)
                ->get();

            $merchantIds = $merchants->pluck('id')->toArray();

            $ratings = Rating::where('vertical', 'shop')
                ->whereIn('merchant_id', $merchantIds)
                ->get()
                ->keyBy('merchant_id');

            $productCounts = ShopProduct::whereIn('merchant_id', $merchantIds)
                ->where('is_available', true)
                ->selectRaw('merchant_id, count(*) as product_count')
                ->groupBy('merchant_id')
                ->pluck('product_count', 'merchant_id');

            $hours = MerchantHour::whereIn('merchant_id', $merchantIds)
                ->orderBy('day_of_week')
                ->orderBy('open_time')
                ->get()
                ->groupBy('merchant_id');

            $config = config('alabiq.shop', []);
            $deliveryFee = $config['delivery_fee_sar'] ?? 15.00;
            $minOrder = $config['min_order_sar'] ?? 50.00;
            $maxDistanceKm = $config['max_distance_km'] ?? 15;

            $deliveryTerms = [
                'base_fee' => $deliveryFee,
                'surcharge_per_km' => $config['surcharge_per_km'] ?? 0.25,
                'max_distance_km' => $maxDistanceKm,
            ];

            $categories = ShopCategory::whereIn('merchant_id', $merchantIds)
                ->where('is_active', true)
                ->distinct()
                ->pluck('name')
                ->filter()
                ->sort()
                ->values();

            return response()->json([
                'stores' => $merchants->map(function ($m) use ($ratings, $productCounts, $hours, $deliveryFee, $minOrder) {
                    $rating = $ratings->get($m->id);
                    $productCount = $productCounts->get($m->id) ?? 0;
                    $merchantHours = $hours->get($m->id, collect());
                    $accepting = $m->accepting_orders ?? true;

                    $state = $this->publicHoursState($accepting, $merchantHours);

                    return [
                        'id' => $m->id,
                        'name' => $m->name,
                        'description' => $m->description,
                        'logo_url' => $m->logo_url,
                        'address' => $m->address,
                        'lat' => $m->lat,
                        'lng' => $m->lng,
                        'service_radius_km' => $m->service_radius_km,
                        'rating' => $rating ? (float)$rating->rating : null,
                        'review_count' => $rating ? (int)$rating->review_count : 0,
                        'product_count' => $productCount,
                        'has_products' => $productCount > 0,
                        'accepting_orders' => $accepting,
                        'is_featured' => $m->is_featured,
                        'badge' => $m->badge,
                        'open_state' => $state['open_state'],
                        'next_change' => $state['next_change'],
                        'next_change_label' => $state['next_change_label'],
                    ];
                }),
                'categories' => $categories,
                'delivery_fee' => $deliveryFee,
                'delivery' => $deliveryTerms,
                'min_order' => $minOrder,
            ]);
        } catch (\Throwable $e) {
            \Log::error('listStores error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    // GET /api/shop/stores/{id}
    public function getStore(Request $request, string $id): JsonResponse
    {
        try {
            $merchant = Merchant::where('id', $id)
                ->where('vertical', 'shop')
                ->where('is_active', true)
                ->where('status', 'active')
                ->first();

            if (!$merchant) {
                return response()->json(['error' => 'Store not found or no longer listed'], 404);
            }

            $merchantHours = MerchantHour::where('merchant_id', $id)
                ->orderBy('day_of_week')
                ->orderBy('open_time')
                ->get();

            $accepting = $merchant->accepting_orders ?? true;
            $state = $this->publicHoursState($accepting, $merchantHours);

            $categories = ShopCategory::where('merchant_id', $id)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get();

            $products = ShopProduct::where('merchant_id', $id)
                ->where('is_available', true)
                ->orderBy('category_id')
                ->orderBy('name')
                ->get();

            $config = config('alabiq.shop', []);
            $deliveryFee = $config['delivery_fee_sar'] ?? 15.00;
            $maxDistanceKm = $config['max_distance_km'] ?? 15;
            $minOrder = $config['min_order_sar'] ?? 50.00;

            $deliveryTerms = [
                'base_fee' => $deliveryFee,
                'surcharge_per_km' => $config['surcharge_per_km'] ?? 0.25,
                'max_distance_km' => $maxDistanceKm,
            ];

            $publicMerchant = $merchant->toArray();
            unset($publicMerchant['vertical'], $publicMerchant['is_active'], $publicMerchant['status']);

            return response()->json([
                'store' => array_merge($publicMerchant, $state),
                'categories' => $categories,
                'products' => $products,
                'delivery_fee' => $deliveryFee,
                'delivery' => $deliveryTerms,
                'min_order' => $minOrder,
            ]);
        } catch (\Throwable $e) {
            \Log::error('getStore error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    protected function publicHoursState(bool $acceptingOrders, $hours): array
    {
        if (!$acceptingOrders) {
            return ['open_state' => 'closed', 'next_change' => null, 'next_change_label' => 'Currently not accepting orders'];
        }

        if ($hours->isEmpty()) {
            return ['open_state' => 'open', 'next_change' => null, 'next_change_label' => 'Open (no hours set)'];
        }

        $now = now();
        $dayOfWeek = (int)$now->format('w');
        $currentTime = $now->format('H:i:s');

        $openNow = false;
        $nextChange = null;
        $nextLabel = null;

        foreach ($hours as $hour) {
            $hourDay = (int)$hour->day_of_week;
            $openTime = $hour->open_time;
            $closeTime = $hour->close_time;

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
                $dayHours = $hours->where('day_of_week', $checkDay);
                if ($dayHours->isNotEmpty()) {
                    $firstOpen = $dayHours->sortBy('open_time')->first();
                    $nextChange = $firstOpen->open_time;
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