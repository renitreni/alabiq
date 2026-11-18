<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\Merchant;
use App\Models\MerchantHour;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ShopCategory;
use App\Models\ShopProduct;
use App\Models\ShopProductVariant;
use App\Models\Order;
use App\Models\ShopOrder;
use App\Models\Profile;

class MerchantController extends Controller
{
    // GET /api/merchant/profile
    public function getProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $merchant = Merchant::where('owner_id', $user->id)->first();

        if (!$merchant) {
            return response()->json(['error' => 'Merchant profile not found'], 404);
        }

        $hours = MerchantHour::where('merchant_id', $merchant->id)
            ->orderBy('day_of_week')
            ->orderBy('open_time')
            ->get();

        return response()->json([
            'merchant' => $merchant,
            'hours' => $hours,
        ]);
    }

    // PATCH /api/merchant/profile
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $merchant = Merchant::where('owner_id', $user->id)->first();

        if (!$merchant) {
            return response()->json(['error' => 'Merchant profile not found'], 404);
        }

        $validated = $request->validate([
            'name' => 'nullable|string|max:200',
            'description' => 'nullable|string',
            'address' => 'nullable|string|max:500',
            'street' => 'nullable|string|max:200',
            'building_number' => 'nullable|string|max:100',
            'lat' => 'nullable|numeric|between:-90,90',
            'lng' => 'nullable|numeric|between:-180,180',
            'service_radius_km' => 'nullable|numeric|min:0.5|max:50',
            'accepting_orders' => 'nullable|boolean',
            'cuisine_type' => 'nullable|string|max:100',
        ]);

        $merchant->update($validated);

        return response()->json(['merchant' => $merchant]);
    }

    // GET /api/merchant/orders
    public function listOrders(Request $request): JsonResponse
    {
        $user = $request->user();

        $merchant = Merchant::where('owner_id', $user->id)->first();

        if (!$merchant) {
            return response()->json(['error' => 'Merchant profile not found'], 404);
        }

        if ($merchant->vertical === 'food') {
            $orders = Order::where('merchant_id', $merchant->id)
                ->with(['customer', 'driver', 'items'])
                ->orderBy('created_at', 'desc')
                ->paginate($request->input('limit', 20));
        } else {
            $orders = ShopOrder::where('merchant_id', $merchant->id)
                ->with(['customer', 'driver', 'items'])
                ->orderBy('created_at', 'desc')
                ->paginate($request->input('limit', 20));
        }

        return response()->json($orders);
    }

    // GET /api/merchant/orders/{code}
    public function getOrder(Request $request, string $code): JsonResponse
    {
        $user = $request->user();

        $merchant = Merchant::where('owner_id', $user->id)->first();

        if (!$merchant) {
            return response()->json(['error' => 'Merchant profile not found'], 404);
        }

        if ($merchant->vertical === 'food') {
            $order = Order::where('order_code', $code)
                ->where('merchant_id', $merchant->id)
                ->with(['customer', 'driver', 'items.menuItem'])
                ->first();
        } else {
            $order = ShopOrder::where('order_code', $code)
                ->where('merchant_id', $merchant->id)
                ->with(['customer', 'driver', 'items.product', 'items.variant'])
                ->first();
        }

        if (!$order) {
            return response()->json(['error' => 'Order not found'], 404);
        }

        return response()->json(['order' => $order]);
    }

    // PATCH /api/merchant/orders/{code}/status
    public function updateOrderStatus(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // GET /api/merchant/menu (food) or /api/merchant/catalog (shop)
    public function getCatalog(Request $request): JsonResponse
    {
        $user = $request->user();

        $merchant = Merchant::where('owner_id', $user->id)->first();

        if (!$merchant) {
            return response()->json(['error' => 'Merchant profile not found'], 404);
        }

        if ($merchant->vertical === 'food') {
            $categories = MenuCategory::where('merchant_id', $merchant->id)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get();

            $items = MenuItem::where('merchant_id', $merchant->id)
                ->where('is_available', true)
                ->orderBy('category_id')
                ->orderBy('name')
                ->get();

            return response()->json([
                'categories' => $categories,
                'items' => $items,
            ]);
        } else {
            $categories = ShopCategory::where('merchant_id', $merchant->id)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get();

            $products = ShopProduct::where('merchant_id', $merchant->id)
                ->where('is_available', true)
                ->orderBy('category_id')
                ->orderBy('name')
                ->get();

            $variants = ShopProductVariant::whereIn('product_id', $products->pluck('id'))
                ->where('is_available', true)
                ->get()
                ->groupBy('product_id');

            return response()->json([
                'categories' => $categories,
                'products' => $products,
                'variants' => $variants,
            ]);
        }
    }

    // POST /api/merchant/menu/categories (food) or /api/merchant/catalog/categories (shop)
    public function createCategory(Request $request): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // PATCH /api/merchant/menu/categories/{id}
    public function updateCategory(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // DELETE /api/merchant/menu/categories/{id}
    public function deleteCategory(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/merchant/menu/items (food) or /api/merchant/catalog/products (shop)
    public function createItem(Request $request): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // PATCH /api/merchant/menu/items/{id} (food) or /api/merchant/catalog/products/{id} (shop)
    public function updateItem(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // DELETE /api/merchant/menu/items/{id} (food) or /api/merchant/catalog/products/{id} (shop)
    public function deleteItem(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/merchant/catalog/products/{id}/variants (shop only)
    public function createVariant(Request $request, string $productId): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // PATCH /api/merchant/catalog/variants/{id}
    public function updateVariant(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // DELETE /api/merchant/catalog/variants/{id}
    public function deleteVariant(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // GET /api/merchant/hours
    public function getHours(Request $request): JsonResponse
    {
        $user = $request->user();

        $merchant = Merchant::where('owner_id', $user->id)->first();

        if (!$merchant) {
            return response()->json(['error' => 'Merchant profile not found'], 404);
        }

        $hours = MerchantHour::where('merchant_id', $merchant->id)
            ->orderBy('day_of_week')
            ->orderBy('open_time')
            ->get();

        return response()->json(['hours' => $hours]);
    }

    // POST /api/merchant/hours
    public function createHour(Request $request): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // PATCH /api/merchant/hours/{id}
    public function updateHour(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // DELETE /api/merchant/hours/{id}
    public function deleteHour(Request $request, string $id): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // GET /api/merchant/stats
    public function getStats(Request $request): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }
}