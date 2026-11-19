<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Order;
use App\Models\ShopOrder;
use App\Models\SavedPaymentMethod;
use App\Services\TapService;

class CardPaymentsController extends Controller
{
    protected TapService $tap;

    public function __construct(TapService $tap)
    {
        $this->tap = $tap;
    }

    // POST /api/bookings/{code}/charge
    public function chargeBooking(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/food/orders/{code}/charge
    public function chargeFoodOrder(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/shop/orders/{code}/charge
    public function chargeShopOrder(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }
}