<?php

namespace App\Http\Controllers\Food;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\MenuItem;
use App\Models\Merchant;
use App\Models\MerchantHour;
use App\Services\FoodMoneyService;

class CartController extends Controller
{
    protected FoodMoneyService $foodMoney;
    protected int $maxQty = 50;

    public function __construct(FoodMoneyService $foodMoney)
    {
        $this->foodMoney = $foodMoney;
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
                'menu_item_id' => 'required|string|max:60',
                'quantity' => 'required|integer|min:1|max:50',
                'size' => 'nullable|string|max:30',
            ]);

            $menuItemId = $validated['menu_item_id'];
            $quantity = $validated['quantity'];
            $size = $validated['size'] ?? null;

            $item = MenuItem::where('id', $menuItemId)
                ->where('is_available', true)
                ->first();

            if (!$item) {
                return response()->json(['error' => 'Menu item not found or unavailable'], 404);
            }

            $merchant = Merchant::where('id', $item->merchant_id)
                ->where('vertical', 'food')
                ->where('is_active', true)
                ->where('status', 'active')
                ->first();

            if (!$merchant) {
                return response()->json(['error' => 'Restaurant not found'], 404);
            }

            if (!($merchant->accepting_orders ?? true)) {
                return response()->json(['error' => 'Restaurant is not accepting orders'], 409);
            }

            $hours = MerchantHour::where('merchant_id', $merchant->id)->get();
            $state = $this->publicHoursState($merchant->accepting_orders ?? true, $hours);
            if ($state['open_state'] === 'closed') {
                return response()->json(['error' => 'Restaurant is currently closed'], 409);
            }

            $sizeOption = null;
            if ($size && $item->size_options) {
                $options = is_string($item->size_options)
                    ? json_decode($item->size_options, true) ?? []
                    : $item->size_options;
                foreach ($options as $opt) {
                    if (($opt['id'] ?? $opt['label'] ?? '') === $size) {
                        $sizeOption = $opt;
                        break;
                    }
                }
                if (!$sizeOption) {
                    return response()->json(['error' => 'Selected size not available'], 400);
                }
            }

            $unitPrice = $sizeOption
                ? $this->foodMoney->round2($sizeOption['price'])
                : $this->foodMoney->round2($item->price);

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
                ->where('menu_item_id', $menuItemId)
                ->where(function ($q) use ($size) {
                    $size ? $q->where('size', $size) : $q->whereNull('size');
                })
                ->first();

            if ($existing) {
                $nextQty = min($existing->quantity + $quantity, $this->maxQty);
                $existing->update(['quantity' => $nextQty, 'unit_price' => $unitPrice]);
            } else {
                CartItem::create([
                    'cart_id' => $cart->id,
                    'menu_item_id' => $menuItemId,
                    'quantity' => min($quantity, $this->maxQty),
                    'size' => $size,
                    'unit_price' => $unitPrice,
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
            ->with('menuItem')
            ->orderBy('created_at')
            ->get();

        $items = $lines->map(function ($line) {
            $menu = $line->menuItem;
            $sizeOption = null;

            if ($line->size && $menu && $menu->size_options) {
                $options = is_string($menu->size_options)
                    ? json_decode($menu->size_options, true) ?? []
                    : $menu->size_options;
                foreach ($options as $opt) {
                    if (($opt['id'] ?? $opt['label'] ?? '') === $line->size) {
                        $sizeOption = $opt;
                        break;
                    }
                }
            }

            $unitPrice = $sizeOption
                ? $this->foodMoney->round2($sizeOption['price'])
                : ($menu ? $this->foodMoney->round2($menu->price) : $this->foodMoney->round2($line->unit_price));

            $sizeStillValid = !$line->size || !!$sizeOption;

            return [
                'id' => $line->id,
                'menu_item_id' => $line->menu_item_id,
                'name' => $menu?->name ?? 'Removed item',
                'image_url' => $menu?->image_url,
                'unit_price' => $unitPrice,
                'quantity' => $line->quantity,
                'size' => $line->size,
                'size_label' => $sizeOption['label'] ?? null,
                'is_available' => ($menu?->is_available ?? false) && $sizeStillValid,
                'line_total' => $this->foodMoney->round2($unitPrice * $line->quantity),
            ];
        });

        $subtotal = $this->foodMoney->round2($items->sum('line_total'));
        $minOrder = config('alabiq.food.min_order_sar', 30);
        $deliveryFee = $this->foodMoney->round2(config('alabiq.food.delivery_fee_sar', 10));
        $vat = $this->foodMoney->vat->vatFor($subtotal);
        $total = $this->foodMoney->round2($subtotal + $deliveryFee + $vat['vatAmount']);

        return [
            'cart_id' => $cart->id,
            'merchant_id' => $cart->merchant_id,
            'items' => $items->values(),
            'subtotal' => $subtotal,
            'min_order' => $minOrder,
            'meets_minimum' => $subtotal >= $minOrder,
            'shortfall' => $subtotal >= $minOrder ? 0 : $this->foodMoney->round2($minOrder - $subtotal),
            'delivery_fee' => $deliveryFee,
            'vat_rate' => $vat['vatRate'],
            'vat_amount' => $vat['vatAmount'],
            'total' => $total,
        ];
    }

    protected function emptyCartResponse(?string $merchantId): array
    {
        $minOrder = config('alabiq.food.min_order_sar', 30);
        $deliveryFee = $this->foodMoney->round2(config('alabiq.food.delivery_fee_sar', 10));
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