<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use App\Models\Booking;
use App\Models\Order;
use App\Models\ShopOrder;
use App\Models\TrackingEvent;

class TrackingController extends Controller
{
    /**
     * GET /api/tracking/{bookingCode}
     */
    public function getTracking(string $bookingCode): JsonResponse
    {
        // Try to find by booking code in any of the three order types
        $booking = Booking::where('booking_code', $bookingCode)->first();
        $order = Order::where('order_code', $bookingCode)->first();
        $shopOrder = ShopOrder::where('order_code', $bookingCode)->first();

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

        $timeline = $events->map(function ($event) {
            return [
                'type' => $event->event_type,
                'description' => $event->description,
                'lat' => $event->lat,
                'lng' => $event->lng,
                'time' => $event->created_at->toISOString(),
            ];
        });

        $code = $entity->booking_code ?? $entity->order_code ?? '';
        $status = $entity->status;

        // Get driver location if assigned
        $driverLocation = null;
        if ($entity->driver_id) {
            // This would fetch from Redis in real implementation
        }

        return response()->json([
            'code' => $code,
            'status' => $status,
            'timeline' => $timeline,
            'driver_location' => $driverLocation,
            'eta' => null, // Would calculate from driver location
        ]);
    }
}