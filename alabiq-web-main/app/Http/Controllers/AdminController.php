<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use App\Models\Booking;
use App\Models\Order;
use App\Models\ShopOrder;
use App\Models\Profile;
use App\Models\Merchant;
use App\Models\MerchantHour;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ShopCategory;
use App\Models\ShopProduct;
use App\Models\ShopProductVariant;
use App\Models\PaymentProof;
use App\Models\ErrorLog;
use App\Models\AppUser;

class AdminController extends Controller
{
    public function getStats(Request $request): JsonResponse
    {
        $stats = [
            'users' => Profile::count(),
            'drivers' => Profile::where('role', 'driver')->count(),
            'merchants' => Merchant::count(),
            'bookings_today' => Booking::whereDate('created_at', today())->count(),
            'orders_today' => Order::whereDate('created_at', today())->count(),
            'shop_orders_today' => ShopOrder::whereDate('created_at', today())->count(),
            'pending_payments' => PaymentProof::where('status', 'pending')->count(),
            'pending_drivers' => Profile::where('role', 'driver')->where('driver_approved', false)->count(),
        ];

        return response()->json(['stats' => $stats]);
    }

    public function getReports(Request $request): JsonResponse
    {
        return response()->json([
            'revenue_today' => 0,
            'bookings_today' => Booking::whereDate('created_at', today())->count(),
            'completed_today' => Booking::whereDate('completed_at', today())->count(),
        ]);
    }

    public function listBookings(Request $request): JsonResponse
    {
        $query = Booking::with(['user', 'driver'])
            ->orderBy('created_at', 'desc');

        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        $bookings = $query->paginate($request->input('limit', 20));

        return response()->json($bookings);
    }

    public function getBookingDetail(Request $request, string $bookingCode): JsonResponse
    {
        $booking = Booking::where('booking_code', $bookingCode)
            ->with(['user', 'driver', 'paymentProof'])
            ->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        return response()->json(['booking' => $booking]);
    }

    public function verifyPayment(Request $request, string $bookingCode): JsonResponse
    {
        $booking = Booking::where('booking_code', $bookingCode)->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        $proof = $booking->paymentProof;

        if (!$proof) {
            return response()->json(['error' => 'No payment proof found'], 404);
        }

        $proof->update([
            'status' => 'verified',
            'verified_at' => now(),
            'verified_by' => Auth::guard('api')->id(),
        ]);

        $booking->update([
            'payment_status' => 'paid',
        ]);

        return response()->json(['success' => true]);
    }

    public function rejectPayment(Request $request, string $bookingCode): JsonResponse
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

        $booking = Booking::where('booking_code', $bookingCode)->first();

        if (!$booking) {
            return response()->json(['error' => 'Booking not found'], 404);
        }

        $proof = $booking->paymentProof;

        if (!$proof) {
            return response()->json(['error' => 'No payment proof found'], 404);
        }

        $proof->update([
            'status' => 'rejected',
            'rejected_at' => now(),
            'rejected_by' => Auth::guard('api')->id(),
            'reject_reason' => $request->input('reason'),
        ]);

        return response()->json(['success' => true]);
    }

    public function assignDriver(Request $request, string $bookingCode): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'driver_id' => 'required|string|max:60',
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

        $driver = Profile::where('id', $request->input('driver_id'))
            ->where('role', 'driver')
            ->where('driver_approved', true)
            ->first();

        if (!$driver) {
            return response()->json(['error' => 'Driver not found or not approved'], 404);
        }

        $booking->update([
            'driver_id' => $driver->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    public function listDrivers(Request $request): JsonResponse
    {
        $query = Profile::where('role', 'driver')
            ->orderBy('created_at', 'desc');

        if ($request->has('approved')) {
            $query->where('driver_approved', $request->boolean('approved'));
        }

        $drivers = $query->paginate($request->input('limit', 20));

        return response()->json($drivers);
    }

    public function setDriverApproval(Request $request, string $driverId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'approved' => 'required|boolean',
            'reject_reason' => 'nullable|string|max:300',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $driver = Profile::where('id', $driverId)
            ->where('role', 'driver')
            ->first();

        if (!$driver) {
            return response()->json(['error' => 'Driver not found'], 404);
        }

        $driver->update([
            'driver_approved' => $request->input('approved'),
            'driver_verification_status' => $request->input('approved') ? 'approved' : 'rejected',
        ]);

        return response()->json(['success' => true]);
    }

    public function listDriverCash(Request $request): JsonResponse
    {
        $drivers = Profile::where('role', 'driver')
            ->where('cash_owed', '>', 0)
            ->orderBy('cash_owed', 'desc')
            ->paginate($request->input('limit', 20));

        return response()->json($drivers);
    }

    public function settleDriverCash(Request $request, string $driverId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'amount' => 'required|numeric|min:0.01|max:1000000',
            'note' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $driver = Profile::where('id', $driverId)
            ->where('role', 'driver')
            ->first();

        if (!$driver) {
            return response()->json(['error' => 'Driver not found'], 404);
        }

        $driver->cash_owed = max(0, $driver->cash_owed - $request->input('amount'));
        $driver->save();

        return response()->json(['success' => true]);
    }

    public function listDriverDocuments(Request $request, string $driverId): JsonResponse
    {
        $documents = \App\Models\DriverDocument::where('driver_id', $driverId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['documents' => $documents]);
    }

    public function reviewDriverDocument(Request $request, string $driverId, string $docId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'approved' => 'required|boolean',
            'reject_reason' => 'nullable|string|max:300',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $doc = \App\Models\DriverDocument::where('id', $docId)
            ->where('driver_id', $driverId)
            ->first();

        if (!$doc) {
            return response()->json(['error' => 'Document not found'], 404);
        }

        $doc->update([
            'status' => $request->input('approved') ? 'approved' : 'rejected',
            'reject_reason' => $request->input('reject_reason'),
            'reviewed_at' => now(),
            'reviewed_by' => Auth::guard('api')->id(),
        ]);

        return response()->json(['success' => true]);
    }

    public function listErrors(Request $request): JsonResponse
    {
        $query = ErrorLog::orderBy('occurred_at', 'desc');

        if ($request->has('resolved')) {
            $query->whereNotNull('resolved_at');
        } else {
            $query->whereNull('resolved_at');
        }

        $errors = $query->paginate($request->input('limit', 50));

        return response()->json($errors);
    }

    public function errorSummary(Request $request): JsonResponse
    {
        $summary = [
            'total' => ErrorLog::count(),
            'unresolved' => ErrorLog::whereNull('resolved_at')->count(),
            'by_severity' => ErrorLog::select('severity', DB::raw('count(*) as count'))
                ->groupBy('severity')
                ->pluck('count', 'severity'),
            'by_label' => ErrorLog::select('label', DB::raw('count(*) as count'))
                ->groupBy('label')
                ->orderBy('count', 'desc')
                ->limit(10)
                ->pluck('count', 'label'),
        ];

        return response()->json($summary);
    }

    public function getError(Request $request, string $id): JsonResponse
    {
        $error = ErrorLog::find($id);

        if (!$error) {
            return response()->json(['error' => 'Error not found'], 404);
        }

        return response()->json(['error' => $error]);
    }

    public function resolveError(Request $request, string $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'resolved' => 'required|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $error = ErrorLog::find($id);

        if (!$error) {
            return response()->json(['error' => 'Error not found'], 404);
        }

        $error->update([
            'resolved_at' => $request->input('resolved') ? now() : null,
            'resolved_by' => $request->input('resolved') ? Auth::guard('api')->id() : null,
        ]);

        return response()->json(['success' => true]);
    }

    public function listAdmins(Request $request): JsonResponse
    {
        $admins = Profile::where('role', 'admin')
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('limit', 20));

        return response()->json($admins);
    }

    public function createAdmin(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:254',
            'full_name' => 'required|string|max:120',
            'mobile_number' => 'nullable|string|max:30',
            'whatsapp_number' => 'nullable|string|max:30',
            'is_super_admin' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $email = strtolower($request->input('email'));

        if (AppUser::whereRaw('LOWER(email) = ?', [$email])->exists()) {
            return response()->json(['error' => 'Email already exists'], 409);
        }

        $userId = Str::uuid();
        $password = Str::random(12);

        DB::transaction(function () use ($email, $userId, $password, $request) {
            AppUser::create([
                'id' => $userId,
                'email' => $email,
                'password_hash' => Hash::make($password),
                'email_verified_at' => now(),
            ]);

            Profile::create([
                'id' => $userId,
                'email' => $email,
                'full_name' => $request->input('full_name'),
                'mobile_number' => $request->input('mobile_number'),
                'whatsapp_number' => $request->input('whatsapp_number'),
                'role' => 'admin',
                'is_super_admin' => $request->boolean('is_super_admin'),
                'service_types' => ['pick_drop', 'food', 'shop'],
                'cash_owed' => 0,
                'cash_owed_limit' => 500,
            ]);
        });

        return response()->json([
            'success' => true,
            'password' => $password,
        ], 201);
    }

    public function updateAdmin(Request $request, string $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'full_name' => 'nullable|string|max:120',
            'mobile_number' => 'nullable|string|max:30',
            'whatsapp_number' => 'nullable|string|max:30',
            'is_super_admin' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $admin = Profile::where('id', $id)
            ->where('role', 'admin')
            ->first();

        if (!$admin) {
            return response()->json(['error' => 'Admin not found'], 404);
        }

        $currentUser = Auth::guard('api')->user();
        if ($admin->id === $currentUser->id && $request->has('is_super_admin') && !$request->boolean('is_super_admin')) {
            return response()->json(['error' => 'Cannot demote yourself'], 400);
        }

        $admin->update($validator->validated());

        return response()->json(['success' => true]);
    }

    public function deactivateAdmin(Request $request, string $id): JsonResponse
    {
        $admin = Profile::where('id', $id)
            ->where('role', 'admin')
            ->first();

        if (!$admin) {
            return response()->json(['error' => 'Admin not found'], 404);
        }

        $currentUser = Auth::guard('api')->user();
        if ($admin->id === $currentUser->id) {
            return response()->json(['error' => 'Cannot deactivate yourself'], 400);
        }

        if ($admin->is_super_admin) {
            $superAdminCount = Profile::where('role', 'admin')
                ->where('is_super_admin', true)
                ->where('disabled_at', null)
                ->count();
            if ($superAdminCount <= 1) {
                return response()->json(['error' => 'Cannot deactivate the last super admin'], 400);
            }
        }

        $admin->update([
            'disabled_at' => now(),
            'disabled_by' => $currentUser->id,
        ]);

        $user = AppUser::find($admin->id);
        if ($user) {
            $user->disabled_at = now();
            $user->save();
        }

        return response()->json(['success' => true]);
    }

    public function reactivateAdmin(Request $request, string $id): JsonResponse
    {
        $admin = Profile::where('id', $id)
            ->where('role', 'admin')
            ->first();

        if (!$admin) {
            return response()->json(['error' => 'Admin not found'], 404);
        }

        $admin->update([
            'disabled_at' => null,
            'disabled_by' => null,
        ]);

        $user = AppUser::find($admin->id);
        if ($user) {
            $user->disabled_at = null;
            $user->save();
        }

        return response()->json(['success' => true]);
    }

    public function setAdminPassword(Request $request, string $id): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'password' => 'required|string|min:8|max:128',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $admin = Profile::where('id', $id)
            ->where('role', 'admin')
            ->first();

        if (!$admin) {
            return response()->json(['error' => 'Admin not found'], 404);
        }

        $user = AppUser::find($admin->id);
        if ($user) {
            $user->password_hash = Hash::make($request->input('password'));
            $user->save();
        }

        return response()->json(['success' => true]);
    }
}
