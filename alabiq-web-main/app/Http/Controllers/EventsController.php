<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\Merchant;

class EventsController extends Controller
{
    /**
     * GET /api/events - SSE stream
     */
    public function stream(Request $request)
    {
        $topic = $request->query('topic', '');

        if (!$this->authorizeTopic($topic)) {
            return response()->json(['error' => 'Event access denied'], 403);
        }

        $base = config('services.realtime.internal_url', 'http://realtime:4100');

        return response()->stream(function () use ($base, $topic) {
            $url = $base . '/subscribe?topic=' . urlencode($topic);
            $context = stream_context_create([
                'http' => [
                    'timeout' => 5,
                ],
            ]);

            $fp = @fopen($url, 'r', false, $context);
            if (!$fp) {
                echo "event: error\ndata: {}\n\n";
                return;
            }

            // Send headers
            echo "retry: 5000\n\n";
            @flush();

            while (!feof($fp)) {
                $line = fgets($fp);
                if ($line === false) break;
                echo $line;
                @flush();
            }

            fclose($fp);
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Authorize access to a topic.
     */
    protected function authorizeTopic(string $topic): bool
    {
        // Public topics
        if (preg_match('/^(booking-SM-[A-Za-z0-9-]+|fd-order-FD-[A-Za-z0-9-]+|shop-order-SH-[A-Za-z0-9-]+)$/', $topic)) {
            return true;
        }

        $user = Auth::guard('api')->user();
        if (!$user) {
            return false;
        }

        $profile = $user->profile;
        if (!$profile) {
            return false;
        }

        // Admin can access everything
        if ($profile->role === 'admin') {
            return true;
        }

        // Driver topics
        if ($topic === 'drivers-available') {
            return $profile->role === 'driver' && $profile->driver_approved;
        }

        if (preg_match('/^driver-([0-9a-f-]{36})$/i', $topic, $matches)) {
            return $profile->role === 'driver' && $matches[1] === $user->id;
        }

        // Merchant topics
        if (preg_match('/^merchant-([0-9a-f-]{36})$/i', $topic, $matches)) {
            if ($profile->role !== 'merchant') {
                return false;
            }
            $merchant = Merchant::where('id', $matches[1])
                ->where('owner_id', $user->id)
                ->first();
            return $merchant !== null;
        }

        return false;
    }
}