<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use App\Models\Booking;
use App\Models\PaymentProof;
use App\Services\FareService;
use App\Services\AppSessionsService;

class BookingsController extends Controller
{
    protected FareService $fare;
    protected AppSessionsService $sessions;

    public function __construct(FareService $fare, AppSessionsService $sessions)
    {
        $this->fare = $fare;
        $this->sessions = $sessions;
    }

    public function createBooking(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'pickup_lat' => 'required|numeric|between:-90,90',
            'pickup_lng' => 'required|numeric|between:-180,180',
            'pickup_address' => 'required|string|max:500',
            'pickup_street' => 'nullable|string|max:200',
            'pickup_building' => 'nullable|string|max:100',
            'dropoff_lat' => 'required|numeric|between:-90,90',
            'dropoff_lng' => 'required|numeric|between:-180,180',
            'dropoff_address' => 'required|string|max:500',
            'dropoff_street' => 'nullable|string|max:200',
            'dropoff_building' => 'nullable|string|max:100',
            'passenger_name' => 'nullable|string|max:120',
            'passenger_mobile' => 'nullable|string|max:40',
            'passenger_whatsapp' => 'nullable|string|max:40',
            'flight_number' => 'nullable|string|max:50',
            'terminal' => 'nullable|string|max:50',
            'scheduled_at' => 'nullable|date',
            'service_type' => 'required|in:pick_drop,food,shop',
            'payment_method' => 'required|in:cash,stcpay,tap',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();

        return DB::transaction(function () use ($request, $user) {
            $data = $validator->validated();

            $fareData = $this->fare->calculate(
                $data['pickup_lat'],
                $data['pickup_lng'],
                $data['dropoff_lat'],
                $data['dropoff_lng'],
                $data['service_type'] ?? 'pick_drop',
                $data['scheduled_at'] ?? null
            );

            $booking = Booking::create([
                'id' => Str::uuid(),
                'booking_code' => 'SM-' . strtoupper(str_replace('-', '', Str::uuid()->toString())),
                'user_id' => $user->id,
                'status' => 'requested',
                'service_type' => $data['service_type'],
                'pickup_lat' => $data['pickup_lat'],
                'pickup_lng' => $data['pickup_lng'],
                'pickup_address' => $data['pickup_address'],
                'pickup_street' => $data['pickup_street'],
                'pickup_building' => $data['pickup_building'],
                'dropoff_lat' => $data['dropoff_lat'],
                'dropoff_lng' => $data['dropoff_lng'],
                'dropoff_address' => $data['dropoff_address'],
                'dropoff_street' => $data['dropoff_street'],
                'dropoff_building' => $data['dropoff_building'],
                'passenger_name' => $data['passenger_name'] ?? $user->profile?->full_name,
                'passenger_mobile' => $data['passenger_mobile'] ?? $user->profile?->mobile_number,
                'passenger_whatsapp' => $data['passenger_whatsapp'] ?? $user->profile?->whatsapp_number,
                'flight_number' => $data['flight_number'],
                'terminal' => $data['terminal'],
                'scheduled_at' => $data['scheduled_at'] ?? null,
                'distance_km' => $fareData['distance_km'],
                'duration_min' => $fareData['duration_min'],
                'fare_amount' => $fareData['fare_amount'],
                'platform_fee' => $fareData['platform_fee'],
                'driver_fee' => $fareData['driver_fee'],
                'vat_amount' => $fareData['vat_amount'],
                'total_amount' => $fareData['total_amount'],
                'payment_method' => $data['payment_method'],
                'payment_status' => 'pending',
            ]);

            return response()->json([
                'booking' => [
                    'id' => $booking->id,
                    'booking_code' => $booking->booking_code,
                    'status' => $booking->status,
                    'fare' => [
                        'fare_amount' => $booking->fare_amount,
                        'platform_fee' => $booking->platform_fee,
                        'driver_fee' => $booking->driver_fee,
                        'vat_amount' => $booking->vat_amount,
                        'total_amount' => $booking->total_amount,
                    ],
                    'distance_km' => $booking->distance_km,
                    'duration_min' => $booking->duration_min,
                ],
            ], 201);
        });
    }

    public function listMyBookings(Request $request): JsonResponse
    {
        $user = Auth::guard('api')->user();

        $bookings = Booking::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($bookings);
    }

    public function getBookingByCode(Request $request, string $bookingCode): JsonResponse
    {
        $booking = Booking::where('booking_code', $bookingCode)
            ->with(['user', 'driver'])
            ->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        return response()->json([
            'booking' => [
                'id' => $booking->id,
                'booking_code' => $booking->booking_code,
                'status' => $booking->status,
                'service_type' => $booking->service_type,
                'pickup_address' => $booking->pickup_address,
                'dropoff_address' => $booking->dropoff_address,
                'passenger_name' => $booking->passenger_name,
                'passenger_mobile' => $booking->passenger_mobile,
                'driver' => $booking->driver ? [
                    'id' => $booking->driver->id,
                    'full_name' => $booking->driver->full_name,
                    'mobile_number' => $booking->driver->mobile_number,
                ] : null,
                'fare' => [
                    'fare_amount' => $booking->fare_amount,
                    'platform_fee' => $booking->platform_fee,
                    'driver_fee' => $booking->driver_fee,
                    'vat_amount' => $booking->vat_amount,
                    'total_amount' => $booking->total_amount,
                ],
                'payment_method' => $booking->payment_method,
                'payment_status' => $booking->payment_status,
                'created_at' => $booking->created_at,
                'accepted_at' => $booking->accepted_at,
                'started_at' => $booking->started_at,
                'completed_at' => $booking->completed_at,
            ],
        ]);
    }

    public function cancelBooking(Request $request, string $bookingCode): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:300',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();

        $booking = Booking::where('booking_code', $bookingCode)
            ->where('user_id', $user->id)
            ->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        if (!in_array($booking->status, ['requested', 'offered', 'accepted'])) {
            return response()->json(['error' => 'Cannot cancel booking in current status'], 400);
        }

        $booking->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancelled_by' => $user->id,
            'cancel_reason' => $request->input('reason'),
        ]);

        return response()->json(['success' => true]);
    }

    public function updateBookingContact(Request $request, string $bookingCode): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'passenger_mobile' => 'nullable|string|max:40',
            'passenger_whatsapp' => 'nullable|string|max:40',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();

        $booking = Booking::where('booking_code', $bookingCode)
            ->where('user_id', $user->id)
            ->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        $booking->update($validator->validated());

        return response()->json(['success' => true]);
    }

    public function rateRideDriver(Request $request, string $code): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'stars' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();

        $booking = Booking::where('booking_code', $code)
            ->where('user_id', $user->id)
            ->where('status', 'completed')
            ->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found or not completed'], 404);
        }

        return response()->json(['success' => true]);
    }

    public function getPaymentInstructions(Request $request, string $bookingCode): JsonResponse
    {
        $booking = Booking::where('booking_code', $bookingCode)->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        return response()->json([
            'booking_code' => $booking->booking_code,
            'amount' => $booking->total_amount,
            'stcpay_number' => config('alabiq.stc_pay.number'),
            'stcpay_name' => config('alabiq.stc_pay.recipient_name'),
            'reference' => $booking->booking_code,
        ]);
    }

    public function createProofUploadUrl(Request $request, string $bookingCode): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'file_name' => 'required|string|max:255',
            'mime_type' => 'required|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $booking = Booking::where('booking_code', $bookingCode)->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        $path = 'payment-proofs/' . $booking->id . '/' . Str::uuid() . '_' . $request->input('file_name');

        return response()->json([
            'upload_url' => 'https://example.com/upload',
            'path' => $path,
        ]);
    }

    public function recordPaymentProof(Request $request, string $bookingCode): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'path' => 'required|string|max:400',
            'file_name' => 'required|string|max:255',
            'mime_type' => 'required|string|max:100',
            'size_bytes' => 'required|integer|min:0',
            'reference' => 'nullable|string|max:120',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $booking = Booking::where('booking_code', $bookingCode)->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        PaymentProof::create([
            'id' => Str::uuid(),
            'booking_id' => $booking->id,
            'path' => $request->input('path'),
            'file_name' => $request->input('file_name'),
            'mime_type' => $request->input('mime_type'),
            'size_bytes' => $request->input('size_bytes'),
            'reference' => $request->input('reference'),
            'status' => 'pending',
        ]);

        return response()->json(['success' => true]);
    }
}
