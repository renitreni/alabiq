<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use App\Models\Booking;
use App\Models\Order;
use App\Models\ShopOrder;
use App\Models\TrackingEvent;

class PublicTrackingController extends Controller
{
    /**
     * GET /api/public/{trackingId}
     */
    public function getPublicTracking(Request $request, string $trackingId): JsonResponse
    {
        $token = $request->query('token');

        if (!$token) {
            return response()->json(['error' => 'Token is required'], 400);
        }

        // Try to find the order by tracking token
        $booking = Booking::where('id', $trackingId)
            ->where('tracking_token', $token)
            ->first();

        $order = Order::where('id', $trackingId)
            ->where('tracking_token', $token)
            ->first();

        $shopOrder = ShopOrder::where('id', $trackingId)
            ->where('tracking_token', $token)
            ->first();

        $entity = $booking ?? $order ?? $shopOrder;

        if (!$entity) {
            return response()->json(['error' => 'Tracking not found'], 404);
        }

        // Get tracking events
        $events = TrackingEvent::where(function ($q) use ($entity) {
            if ($entity instanceof Booking) {
                $q->where('booking_id', $entity->id);
            } elseif ($entity instanceof Order) {
                $q->where('order_id', $entity->id);
            } elseif ($entity instanceof ShopOrder) {
                $q->where('shop_order_id', $entity->id);
            }
        })
        ->orderBy('created_at')
        ->get();

        // Format response
        $timeline = $events->map(function ($event) {
            return [
                'type' => $event->event_type,
                'description' => $event->description,
                'lat' => $event->lat,
                'lng' => $event->lng,
                'time' => $event->created_at->toISOString(),
            ];
        });

        return response()->json([
            'tracking_id' => $entity->id,
            'code' => $entity->booking_code ?? $entity->order_code ?? '',
            'status' => $entity->status,
            'timeline' => $timeline,
        ]);
    }

    /**
     * GET /api/public/{trackingId}/stream - SSE
     */
    public function getPublicTrackingSSE(Request $request, string $trackingId)
    {
        $token = $request->query('token');

        if (!$token) {
            return response()->json(['error' => 'Token is required'], 400);
        }

        // Verify token
        $booking = Booking::where('id', $trackingId)
            ->where('tracking_token', $token)
            ->first();

        $order = Order::where('id', $trackingId)
            ->where('tracking_token', $token)
            ->first();

        $shopOrder = ShopOrder::where('id', $trackingId)
            ->where('tracking_token', $token)
            ->first();

        $entity = $booking ?? $order ?? $shopOrder;

        if (!$entity) {
            return response()->json(['error' => 'Tracking not found'], 404);
        }

        // For SSE, we would need a realtime service connection
        // This is a placeholder that returns the current state
        return $this->getPublicTracking($request, $trackingId);
    }
}