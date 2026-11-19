<?php

namespace App\Http\Controllers\Food;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\FoodEvent;

class EventsController extends Controller
{
    // POST /api/food/events
    public function recordEvent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'event_name' => 'required|string|max:60',
            'merchant_id' => 'nullable|string|max:60',
            'order_id' => 'nullable|string|max:60',
            'params' => 'nullable|array|max:2000',
        ]);

        $user = $request->user();

        FoodEvent::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'event_name' => $validated['event_name'],
            'merchant_id' => $validated['merchant_id'] ?? null,
            'order_id' => $validated['order_id'] ?? null,
            'user_id' => $user?->id ?? null,
            'params' => $validated['params'] ?? null,
        ]);

        return response()->json(['success' => true]);
    }
}