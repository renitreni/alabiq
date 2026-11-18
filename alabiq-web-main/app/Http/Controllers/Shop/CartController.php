<?php

namespace App\Http\Controllers\Shop;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\ShopProduct;
use App\Models\ShopProductVariant;
use App\Models\Merchant;
use App\Models\MerchantHour;
use App\Services\ShopMoneyService;

class CartController extends Controller
{
    protected ShopMoneyService $shopMoney;
    protected int $maxQty = 50;

    public function __construct(ShopMoneyService $shopMoney)
    {
        $this->shopMoney = $shopMoney;
    }

    public function getCart(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            $merchantId = $request->query('merchant_id');

            if (!$merchantId) {
                return response()->json(['error' => 'merchant_id is required'], 400);
            }

            $cart = Cart::where('user_id', $user->id)
                ->where('merchant_id', $merchantId)
                ->first();

            if (!$cart) {
                return response()->json($this->emptyCartResponse($merchantId));
            }

            return response()->json($this->buildCartSummary($cart));
        } catch (\Throwable $e) {
            \Log::error('getCart error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    public function addCartItem(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            $validated = $request->validate([
                'product_id' => 'required|string|max:60',
                'variant_id' => 'nullable|string|max:60',
                'quantity' => 'required|integer|min:1|max:50',
            ]);

            $productId = $validated['product_id'];
            $variantId = $validated['variant_id'] ?? null;
            $quantity = $validated['quantity'];

            $product = ShopProduct::where('id', $productId)
                ->where('is_available', true)
                ->first();

            if (!$product) {
                return response()->json(['error' => 'Product not found or unavailable'], 404);
            }

            $variant = null;
            if ($variantId) {
                $variant = ShopProductVariant::where('id', $variantId)
                    ->where('product_id', $productId)
                    ->where('is_available', true)
                    ->first();

                if (!$variant) {
                    return response()->json(['error' => 'Product variant not found or unavailable'], 404);
                }
            }

            $merchant = Merchant::where('id', $product->merchant_id)
                ->where('vertical', 'shop')
                ->where('is_active', true)
                ->where('status', 'active')
                ->first();

            if (!$merchant) {
                return response()->json(['error' => 'Store not found'], 404);
            }

            if (!($merchant->accepting_orders ?? true)) {
                return response()->json(['error' => 'Store is not accepting orders'], 409);
            }

            $hours = MerchantHour::where('merchant_id', $merchant->id)->get();
            $state = $this->publicHoursState($merchant->accepting_orders ?? true, $hours);
            if ($state['open_state'] === 'closed') {
                return response()->json(['error' => 'Store is currently closed'], 409);
            }

            $pricing = $this->shopMoney->resolveUnitPricing($product->toArray(), $variant?->toArray());
            $unitPrice = $pricing['unitPrice'];
            $netPrice = $pricing['netPrice'];

            $availability = $this->shopMoney->availabilityBand(
                $variant ? $variant->toArray() : $product->toArray(),
                $product->track_stock ?? true
            );

            if ($availability === 'out') {
                return response()->json(['error' => 'Product is out of stock'], 409);
            }

            $availableUnits = $this->shopMoney->availableUnits($product->toArray(), $variant?->toArray());
            if ($availableUnits !== null && $quantity > $availableUnits) {
                return response()->json(['error' => 'Not enough stock available'], 409);
            }

            $cart = Cart::where('user_id', $user->id)
                ->where('merchant_id', $merchant->id)
                ->first();

            if (!$cart) {
                $cart = Cart::create([
                    'user_id' => $user->id,
                    'merchant_id' => $merchant->id,
                ]);
            }

            $existing = CartItem::where('cart_id', $cart->id)
                ->where('product_id', $productId)
                ->where(function ($q) use ($variantId) {
                    $variantId ? $q->where('variant_id', $variantId) : $q->whereNull('variant_id');
                })
                ->first();

            if ($existing) {
                $nextQty = min($existing->quantity + $quantity, $this->maxQty);
                $existing->update(['quantity' => $nextQty]);
            } else {
                CartItem::create([
                    'cart_id' => $cart->id,
                    'product_id' => $productId,
                    'variant_id' => $variantId,
                    'quantity' => min($quantity, $this->maxQty),
                ]);
            }

            return response()->json($this->buildCartSummary($cart), 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['error' => 'Validation failed', 'details' => $e->errors()], 400);
        } catch (\Throwable $e) {
            \Log::error('addCartItem error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    public function updateCartItem(Request $request, string $id): JsonResponse
    {
        try {
            $user = $request->user();
            $validated = $request->validate(['quantity' => 'required|integer|min:0|max:50']);

            $line = CartItem::where('id', $id)
                ->whereHas('cart', fn($q) => $q->where('user_id', $user->id))
                ->first();

            if (!$line) {
                return response()->json(['error' => 'Cart item not found'], 404);
            }

            $cartId = $line->cart_id;

            if ($validated['quantity'] === 0) {
                $line->delete();
            } else {
                $line->update(['quantity' => $validated['quantity']]);
            }

            $cart = Cart::find($cartId);
            if (!$cart) {
                return response()->json(['error' => 'Cart not found'], 404);
            }

            return response()->json($this->buildCartSummary($cart));
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['error' => 'Validation failed', 'details' => $e->errors()], 400);
        } catch (\Throwable $e) {
            \Log::error('updateCartItem error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    public function removeCartItem(Request $request, string $id): JsonResponse
    {
        try {
            $user = $request->user();

            $line = CartItem::where('id', $id)
                ->whereHas('cart', fn($q) => $q->where('user_id', $user->id))
                ->first();

            if (!$line) {
                return response()->json(['error' => 'Cart item not found'], 404);
            }

            $cartId = $line->cart_id;
            $line->delete();

            $cart = Cart::find($cartId);
            if (!$cart) {
                return response()->json($this->emptyCartResponse(null));
            }

            return response()->json($this->buildCartSummary($cart));
        } catch (\Throwable $e) {
            \Log::error('removeCartItem error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['error' => 'Unexpected server error'], 500);
        }
    }

    protected function buildCartSummary(Cart $cart): array
    {
        $lines = CartItem::where('cart_id', $cart->id)
            ->with(['product', 'variant'])
            ->orderBy('created_at')
            ->get();

        $items = $lines->map(function ($line) {
            $product = $line->product;
            $variant = $line->variant;

            $pricing = $this->shopMoney->resolveUnitPricing(
                $product?->toArray() ?? [],
                $variant?->toArray()
            );
            $unitPrice = $pricing['unitPrice'];
            $netPrice = $pricing['netPrice'];

            $availability = $this->shopMoney->availabilityBand(
                $variant ? $variant->toArray() : ($product?->toArray() ?? []),
                $product?->track_stock ?? true
            );

            $availableUnits = $this->shopMoney->availableUnits(
                $product?->toArray() ?? [],
                $variant?->toArray()
            );

            return [
                'id' => $line->id,
                'product_id' => $line->product_id,
                'variant_id' => $line->variant_id,
                'name' => $product?->name ?? 'Removed item',
                'variant_label' => $variant?->label,
                'sku' => $variant?->sku ?? $product?->sku,
                'unit_price' => $unitPrice,
                'quantity' => $line->quantity,
                'is_available' => $availability !== 'out',
                'availability' => $availability,
                'available_units' => $availableUnits,
                'line_total' => $this->shopMoney->round2($unitPrice * $line->quantity),
            ];
        });

        $subtotal = $this->shopMoney->round2($items->sum('line_total'));
        $minOrder = config('alabiq.shop.min_order_sar', 50);
        $deliveryFee = $this->shopMoney->round2(config('alabiq.shop.delivery_fee_sar', 15));
        $vat = $this->shopMoney->vat->vatFor($subtotal);
        $total = $this->shopMoney->round2($subtotal + $deliveryFee + $vat['vatAmount']);

        return [
            'cart_id' => $cart->id,
            'merchant_id' => $cart->merchant_id,
            'items' => $items->values(),
            'subtotal' => $subtotal,
            'min_order' => $minOrder,
            'meets_minimum' => $subtotal >= $minOrder,
            'shortfall' => $subtotal >= $minOrder ? 0 : $this->shopMoney->round2($minOrder - $subtotal),
            'delivery_fee' => $deliveryFee,
            'vat_rate' => $vat['vatRate'],
            'vat_amount' => $vat['vatAmount'],
            'total' => $total,
        ];
    }

    protected function emptyCartResponse(?string $merchantId): array
    {
        $minOrder = config('alabiq.shop.min_order_sar', 50);
        $deliveryFee = $this->shopMoney->round2(config('alabiq.shop.delivery_fee_sar', 15));
        return [
            'cart_id' => null,
            'merchant_id' => $merchantId,
            'items' => [],
            'subtotal' => 0,
            'min_order' => $minOrder,
            'meets_minimum' => false,
            'shortfall' => $minOrder,
            'delivery_fee' => $deliveryFee,
            'vat_rate' => config('vat.rate', 0.15),
            'vat_amount' => 0,
            'total' => 0,
        ];
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