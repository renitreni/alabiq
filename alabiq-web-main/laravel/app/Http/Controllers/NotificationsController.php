<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use App\Models\PushSubscription;

class NotificationsController extends Controller
{
    /**
     * GET /api/notifications/push-config
     */
    public function pushConfig(Request $request): JsonResponse
    {
        return response()->json([
            'vapidPublicKey' => config('services.vapid.public_key'),
        ]);
    }

    /**
     * POST /api/notifications/register
     */
    public function registerToken(Request $request): JsonResponse
    {
        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'endpoint' => 'required|string',
            'keys' => 'required|array',
            'keys.p256dh' => 'required|string',
            'keys.auth' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();

        PushSubscription::updateOrCreate(
            ['user_id' => $user->id, 'endpoint' => $request->input('endpoint')],
            [
                'p256dh' => $request->input('keys.p256dh'),
                'auth' => $request->input('keys.auth'),
            ]
        );

        return response()->json(['success' => true]);
    }

    /**
     * POST /api/notifications/unregister
     */
    public function unregisterToken(Request $request): JsonResponse
    {
        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'endpoint' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();

        PushSubscription::where('user_id', $user->id)
            ->where('endpoint', $request->input('endpoint'))
            ->delete();

        return response()->json(['success' => true]);
    }

    /**
     * GET /api/notifications
     */
    public function listMyNotifications(Request $request): JsonResponse
    {
        $user = Auth::guard('api')->user();

        $notifications = \App\Models\Notification::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($notifications);
    }

    /**
     * PATCH /api/notifications/read
     */
    public function markAllRead(Request $request): JsonResponse
    {
        $user = Auth::guard('api')->user();

        \App\Models\Notification::where('user_id', $user->id)
            ->where('read_at', null)
            ->update(['read_at' => now()]);

        return response()->json(['success' => true]);
    }
}