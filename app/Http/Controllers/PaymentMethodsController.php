<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\SavedPaymentMethod;
use App\Models\PaymentCustomer;
use App\Services\TapService;

class PaymentMethodsController extends Controller
{
    protected TapService $tap;

    public function __construct(TapService $tap)
    {
        $this->tap = $tap;
    }

    // GET /api/payment-methods
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $methods = SavedPaymentMethod::where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->orderByDesc('is_default')
            ->orderBy('created_at')
            ->get();

        return response()->json(['methods' => $methods]);
    }

    // POST /api/payment-methods (save new card)
    public function store(Request $request): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // PATCH /api/payment-methods/{id}/default
    public function setDefault(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $method = SavedPaymentMethod::where('id', $id)
            ->where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->first();

        if (!$method) {
            return response()->json(['error' => 'Payment method not found'], 404);
        }

        SavedPaymentMethod::where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->update(['is_default' => false]);

        $method->update(['is_default' => true]);

        return response()->json(['success' => true]);
    }

    // DELETE /api/payment-methods/{id}
    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $method = SavedPaymentMethod::where('id', $id)
            ->where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->first();

        if (!$method) {
            return response()->json(['error' => 'Payment method not found'], 404);
        }

        $method->update(['deleted_at' => now()]);

        return response()->json(['success' => true]);
    }
}