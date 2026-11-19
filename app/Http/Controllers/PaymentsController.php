<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Order;
use App\Models\ShopOrder;
use App\Models\PaymentProof;
use App\Models\WebhookEvent;
use App\Services\ObjectStorageService;

class PaymentsController extends Controller
{
    protected ObjectStorageService $storage;

    public function __construct(ObjectStorageService $storage)
    {
        $this->storage = $storage;
    }

    // POST /api/payments/webhooks/tap
    public function tapWebhook(Request $request): JsonResponse
    {
        // TODO: Implement Tap webhook handling
        // - Verify signature
        // - Parse event type
        // - Update payment status
        // - Emit tracking events

        $payload = $request->all();
        $signature = $request->header('X-Tap-Signature');

        WebhookEvent::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'provider' => 'tap',
            'event_type' => $payload['event'] ?? 'unknown',
            'gateway_payment_id' => $payload['id'] ?? null,
            'signature_verified' => false,
            'payload' => $payload,
        ]);

        return response()->json(['received' => true]);
    }

    // GET /api/payments/proofs/{id}/download
    public function downloadProof(Request $request, string $id): JsonResponse
    {
        // TODO: Implement signed download URL for payment proofs
        return response()->json(['error' => 'Not yet implemented'], 501);
    }
}