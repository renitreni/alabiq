<?php

namespace App\Http\Controllers\Shop;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Http\Controllers\Controller;
use App\Models\ShopOrder;
use App\Models\ShopOrderItem;
use App\Models\Merchant;
use App\Models\MerchantHour;
use App\Models\ShopProduct;
use App\Models\ShopProductVariant;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\PaymentProof;
use App\Services\ShopMoneyService;
use App\Services\AppSessionsService;

class OrdersController extends Controller
{
    protected ShopMoneyService $shopMoney;
    protected AppSessionsService $sessions;

    public function __construct(ShopMoneyService $shopMoney, AppSessionsService $sessions)
    {
        $this->shopMoney = $shopMoney;
        $this->sessions = $sessions;
    }

    public function checkout(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'merchant_id' => 'required|string|max:60',
            'delivery_address' => 'required|string|max:500',
            'delivery_lat' => 'required|numeric|between:-90,90',
            'delivery_lng' => 'required|numeric|between:-180,180',
            'delivery_street' => 'required|string|max:200',
            'delivery_building' => 'required|string|max:100',
            'contact_phone' => 'nullable|string|max:40',
            'payment_method' => 'required|in:stcpay,cash,tap',
        ]);

        $user = $request->user();
        $cart = Cart::where('user_id', $user->id)
            ->where('merchant_id', $validated['merchant_id'])
            ->with(['items.product', 'items.variant'])
            ->first();

        if (!$cart || $cart->items->isEmpty()) {
            return response()->json(['error' => 'Cart is empty'], 400);
        }

        $merchant = Merchant::where('id', $validated['merchant_id'])
            ->where('vertical', 'shop')
            ->where('is_active', true)
            ->where('status', 'active')
            ->first();

        if (!$merchant) {
            return response()->json(['error' => 'Store not found'], 404);
        }

        $hours = MerchantHour::where('merchant_id', $merchant->id)->get();
        $state = $this->publicHoursState($merchant->accepting_orders ?? true, $hours);
        if ($state['open_state'] === 'closed') {
            return response()->json(['error' => 'Store is currently closed'], 409);
        }

        $items = $this->buildPricingItems($cart);
        $distanceKm = $this->calculateDistance(
            $merchant->lat, $merchant->lng,
            $validated['delivery_lat'], $validated['delivery_lng']
        );

        $pricing = $this->shopMoney->priceShopOrder($items, $distanceKm);
        if (!$pricing['ok']) {
            return response()->json($pricing, 422);
        }

        $credit = $this->shopMoney->creditAfterCharge($merchant, $pricing['marginTotal']);
        if (!$credit['canAccept']) {
            return response()->json([
                'error' => 'Merchant credit limit exceeded',
                'credit' => $credit,
            ], 409);
        }

        return DB::transaction(function () use ($user, $validated, $merchant, $cart, $pricing, $credit) {
            $order = $this->createOrder($user, $validated, $merchant, $pricing);
            $this->createOrderItems($order, $pricing['lines']);
            $this->decrementStock($pricing['lines']);
            $merchant->increment('credit_used', $pricing['marginTotal']);
            CartItem::where('cart_id', $cart->id)->delete();
            return response()->json(['order' => $this->formatOrder($order)], 201);
        });
    }

    protected function buildPricingItems(Cart $cart): array
    {
        return $cart->items->map(function ($line) {
            $product = $line->product;
            $variant = $line->variant;

            $pricing = $this->shopMoney->resolveUnitPricing(
                $product?->toArray() ?? [],
                $variant?->toArray()
            );
            $unitPrice = $pricing['unitPrice'];
            $netPrice = $pricing['netPrice'];

            return [
                'productId' => $line->product_id,
                'variantId' => $line->variant_id,
                'name' => $product?->name ?? 'Item',
                'variantLabel' => $variant?->label,
                'sku' => $variant?->sku ?? $product?->sku,
                'unitPrice' => $unitPrice,
                'netPrice' => $netPrice,
                'quantity' => $line->quantity,
            ];
        })->toArray();
    }

    protected function calculateDistance(?float $lat1, ?float $lng1, ?float $lat2, ?float $lng2): ?float
    {
        if (!$lat1 || !$lng1 || !$lat2 || !$lng2) return null;
        $earthRadius = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLng / 2) * sin($dLng / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return round($earthRadius * $c, 2);
    }

    protected function createOrder($user, $validated, $merchant, $pricing): ShopOrder
    {
        return ShopOrder::create([
            'id' => Str::uuid(),
            'order_code' => 'SH-' . strtoupper(Str::uuid()->toString()),
            'customer_id' => $user->id,
            'merchant_id' => $merchant->id,
            'status' => 'pending',
            'subtotal' => $pricing['subtotal'],
            'delivery_fee' => $pricing['baseDeliveryFee'],
            'delivery_surcharge' => $pricing['deliverySurcharge'],
            'vat_amount' => $pricing['vatAmount'],
            'vat_rate' => $pricing['vatRate'],
            'total_amount' => $pricing['total'],
            'delivery_address' => $validated['delivery_address'],
            'delivery_lat' => $validated['delivery_lat'],
            'delivery_lng' => $validated['delivery_lng'],
            'delivery_street' => $validated['delivery_street'],
            'delivery_building' => $validated['delivery_building'],
            'contact_phone' => $validated['contact_phone'] ?? $user->profile?->mobile_number,
            'payment_method' => $validated['payment_method'],
            'payment_status' => 'awaiting',
        ]);
    }

    protected function createOrderItems(ShopOrder $order, array $lines): void
    {
        foreach ($lines as $line) {
            ShopOrderItem::create([
                'id' => Str::uuid(),
                'shop_order_id' => $order->id,
                'product_id' => $line['productId'],
                'variant_id' => $line['variantId'] ?? null,
                'name' => $line['name'],
                'variant_label' => $line['variantLabel'],
                'sku' => $line['sku'],
                'unit_price' => $line['unitPrice'],
                'quantity' => $line['quantity'],
                'line_total' => $line['lineTotal'],
                'margin_per_item' => $line['marginPerItem'],
                'margin_total' => $line['marginTotal'],
            ]);
        }
    }

    protected function decrementStock(array $lines): void
    {
        foreach ($lines as $line) {
            if ($line['variantId']) {
                ShopProductVariant::where('id', $line['variantId'])
                    ->decrement('stock_quantity', $line['quantity']);
            } else {
                ShopProduct::where('id', $line['productId'])
                    ->decrement('stock_quantity', $line['quantity']);
            }
        }
    }

    protected function formatOrder(ShopOrder $order): array
    {
        return [
            'id' => $order->id,
            'order_code' => $order->order_code,
            'status' => $order->status,
            'subtotal' => $order->subtotal,
            'delivery_fee' => $order->delivery_fee,
            'delivery_surcharge' => $order->delivery_surcharge,
            'vat_amount' => $order->vat_amount,
            'vat_rate' => $order->vat_rate,
            'total_amount' => $order->total_amount,
            'payment_method' => $order->payment_method,
            'payment_status' => $order->payment_status,
        ];
    }

    public function listOrders(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = ShopOrder::where('customer_id', $user->id)
            ->with(['merchant', 'driver', 'paymentProof'])
            ->orderBy('created_at', 'desc');

        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        $orders = $query->paginate($request->input('limit', 20));
        return response()->json($orders);
    }

    public function getOrder(Request $request, string $code): JsonResponse
    {
        $user = $request->user();
        $order = ShopOrder::where('order_code', $code)
            ->where('customer_id', $user->id)
            ->with(['merchant', 'driver', 'paymentProof', 'items.product', 'items.variant'])
            ->first();

        if (!$order) {
            return response()->json(['error' => 'Order not found'], 404);
        }
        return response()->json(['order' => $order]);
    }

    public function updateOrderContact(Request $request, string $code): JsonResponse
    {
        $validated = $request->validate([
            'contact_phone' => 'required|string|max:40',
        ]);

        $user = $request->user();
        $order = ShopOrder::where('order_code', $code)
            ->where('customer_id', $user->id)
            ->whereIn('status', ['pending', 'accepted', 'packing', 'ready', 'out_for_delivery'])
            ->first();

        if (!$order) {
            return response()->json(['error' => 'Order not found or cannot be updated'], 404);
        }

        $order->update(['contact_phone' => $validated['contact_phone']]);
        return response()->json(['success' => true]);
    }

    public function getPaymentInfo(Request $request, string $code): JsonResponse
    {
        $user = $request->user();
        $order = ShopOrder::where('order_code', $code)
            ->where('customer_id', $user->id)
            ->first();

        if (!$order) {
            return response()->json(['error' => 'Order not found'], 404);
        }

        return response()->json([
            'order_code' => $order->order_code,
            'amount' => $order->total_amount,
            'stcpay_number' => config('alabiq.stc_pay.number'),
            'stcpay_name' => config('alabiq.stc_pay.recipient_name'),
            'reference' => $order->order_code,
        ]);
    }

    public function createPayUploadUrl(Request $request, string $code): JsonResponse
    {
        $validated = $request->validate([
            'file_name' => 'required|string|max:255',
            'mime_type' => 'required|string|max:100',
        ]);

        $user = $request->user();
        $order = ShopOrder::where('order_code', $code)
            ->where('customer_id', $user->id)
            ->first();

        if (!$order) {
            return response()->json(['error' => 'Order not found'], 404);
        }

        return response()->json([
            'upload_url' => 'https://example.com/upload',
            'path' => 'payment-proofs/' . $order->id . '/' . Str::uuid() . '_' . $request->input('file_name'),
        ]);
    }

    public function recordPayment(Request $request, string $code): JsonResponse
    {
        $validated = $request->validate([
            'path' => 'required|string|max:400',
            'file_name' => 'required|string|max:255',
            'mime_type' => 'required|string|max:100',
            'size_bytes' => 'required|integer|min:0',
            'reference' => 'nullable|string|max:120',
        ]);

        $user = $request->user();
        $order = ShopOrder::where('order_code', $code)
            ->where('customer_id', $user->id)
            ->first();

        if (!$order) {
            return response()->json(['error' => 'Order not found'], 404);
        }

        PaymentProof::create([
            'id' => Str::uuid(),
            'shop_order_id' => $order->id,
            'path' => $validated['path'],
            'file_name' => $validated['file_name'],
            'mime_type' => $validated['mime_type'],
            'size_bytes' => $validated['size_bytes'],
            'reference' => $validated['reference'],
            'status' => 'pending',
        ]);

        return response()->json(['success' => true]);
    }

    public function createCardCharge(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Card payments not yet implemented'], 501);
    }

    public function rateShopDriver(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Rating not yet implemented'], 501);
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