<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Merchant;
use App\Models\Order;
use App\Models\Profile;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Blade admin portal — server-rendered counterpart of the archived React
 * admin views (portal/admin/*). Read-oriented: aggregates and lists come
 * straight from the same tables the API serves. Payment verification and
 * other money-moving actions stay in the API layer (lib parity is Phase B
 * work); this controller only implements the low-risk state flips the
 * Express admin exposed, e.g. driver approval.
 */
class PagesController extends Controller
{
    private const ACTIVE_STATUSES = ['driver_assigned', 'driver_on_the_way', 'arrived', 'in_progress'];

    public function dashboard()
    {
        $byStatus = Booking::query()->select('status', DB::raw('count(*) as n'))->groupBy('status')->pluck('n', 'status');

        $totals = [
            'bookings' => (int) $byStatus->sum(),
            'completed' => (int) ($byStatus['completed'] ?? 0),
            'cancelled' => (int) ($byStatus['cancelled'] ?? 0),
            'today' => Booking::whereDate('created_at', today())->count(),
            'active' => (int) $byStatus->only(self::ACTIVE_STATUSES)->sum(),
            // Express marks verified bookings 'verified', not 'paid'.
            'revenue' => (float) Booking::where('payment_status', 'verified')->sum('total_amount')
                + (float) Order::where('payment_status', 'verified')->sum('total_amount'),
            'needsReview' => DB::table('payment_proofs')->where('status', 'pending')->count(),
            'awaitingPayment' => (int) ($byStatus['pending_payment'] ?? 0),
        ];

        $drivers = [
            'approved' => Profile::where('role', 'driver')->where('driver_approved', true)->count(),
            'pending' => Profile::where('role', 'driver')->where('driver_approved', false)->count(),
        ];

        $recentBookings = Booking::query()
            ->with('user:id,full_name')
            ->latest('created_at')
            ->take(8)
            ->get(['id', 'booking_code', 'status', 'payment_status', 'total_amount', 'user_id', 'created_at']);

        return view('admin.dashboard', [
            'totals' => $totals,
            'drivers' => $drivers,
            'byStatus' => $byStatus,
            'recentBookings' => $recentBookings,
            'greeting' => $this->greeting(),
        ]);
    }

    public function bookings(Request $request)
    {
        $bookings = Booking::query()
            ->with('user:id,full_name')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('payment_status'), fn ($q) => $q->where('payment_status', $request->string('payment_status')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = '%' . $request->string('q') . '%';
                $q->where('booking_code', $this->likeOp(), $term);
            })
            ->latest('created_at')
            ->paginate(20)
            ->withQueryString();

        // Work waiting on an admin — mirrors the BookingsView proof queue.
        $pendingProofs = DB::table('payment_proofs as pp')
            ->leftJoin('bookings as b', 'b.id', '=', 'pp.booking_id')
            ->where('pp.status', 'pending')
            ->orderByDesc('pp.created_at')
            ->take(20)
            ->get([
                'pp.id', 'pp.file_name', 'pp.reference', 'pp.mime_type', 'pp.size_bytes', 'pp.created_at',
                'b.booking_code', 'b.total_amount',
            ]);

        return view('admin.bookings', [
            'bookings' => $bookings,
            'pendingProofs' => $pendingProofs,
            'statuses' => $this->bookingStatuses(),
        ]);
    }

    public function drivers()
    {
        $drivers = Profile::query()
            ->where('role', 'driver')
            ->withCount('documents')
            ->orderBy('driver_approved')
            ->orderByDesc('created_at')
            ->paginate(20);

        return view('admin.drivers', ['drivers' => $drivers]);
    }

    /**
     * Same flip as Express setDriverApproval: driver_approved on the
     * driver's profile, with the verification status kept in step.
     */
    public function updateDriverApproval(Request $request, Profile $driver)
    {
        abort_unless($driver->role === 'driver', 404);

        $approved = $request->boolean('approved');

        $driver->update([
            'driver_approved' => $approved,
            'driver_verification_status' => $approved ? 'approved' : 'rejected',
        ]);

        return back()->with('status', $approved ? 'Driver approved.' : 'Driver rejected.');
    }

    public function restaurantOrders()
    {
        $orders = Order::query()
            ->with('merchant:id,name', 'user:id,full_name')
            ->latest('created_at')
            ->take(100)
            ->get();

        $notStarted = $orders->filter(fn (Order $o) => $o->status === 'accepted' && $o->preparing_at === null);

        return view('admin.restaurant-orders', [
            'orders' => $orders,
            'notStarted' => $notStarted,
            'statusCounts' => $orders->countBy('status'),
        ]);
    }

    public function food()
    {
        $merchants = Merchant::query()
            ->where('vertical', 'food')
            ->withCount('menuItems')
            ->orderBy('name')
            ->get();

        $paymentSummary = Order::query()
            ->select('payment_status', DB::raw('count(*) as n'), DB::raw('sum(total_amount) as total'))
            ->groupBy('payment_status')
            ->get();

        return view('admin.food', [
            'merchants' => $merchants,
            'paymentSummary' => $paymentSummary,
        ]);
    }

    public function shop()
    {
        abort_unless(config('services.shop_enabled'), 403, 'Shop is feature-flagged off (SHOP_ENABLED).');

        $merchants = Merchant::query()
            ->where('vertical', 'shop')
            ->withCount('products')
            ->orderBy('name')
            ->get();

        $recentOrders = DB::table('shop_orders')->latest('created_at')->take(50)->get();

        return view('admin.shop', [
            'merchants' => $merchants,
            'recentOrders' => $recentOrders,
        ]);
    }

    public function reports(Request $request)
    {
        $from = Carbon::parse($request->input('from', today()->subDays(29)->toDateString()))->startOfDay();
        $to = Carbon::parse($request->input('to', today()->toDateString()))->endOfDay();

        $dayExpr = DB::connection()->getDriverName() === 'pgsql'
            ? "to_char(created_at, 'YYYY-MM-DD')"
            : "date_format(created_at, '%Y-%m-%d')";

        $dailyBookings = Booking::query()
            ->whereBetween('created_at', [$from, $to])
            ->select(
                DB::raw("$dayExpr as day"),
                DB::raw('count(*) as bookings'),
                DB::raw("coalesce(sum(case when payment_status = 'verified' then total_amount else 0 end), 0) as revenue")
            )
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        $dailyOrders = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->select(DB::raw("$dayExpr as day"), DB::raw('count(*) as orders'))
            ->groupBy('day')
            ->pluck('orders', 'day');

        $rows = $dailyBookings->map(fn ($r) => [
            'day' => $r->day,
            'bookings' => (int) $r->bookings,
            'orders' => (int) ($dailyOrders[$r->day] ?? 0),
            'revenue' => (float) $r->revenue,
        ])->values();

        if ($request->boolean('export')) {
            return response()->streamDownload(function () use ($rows) {
                $out = fopen('php://output', 'w');
                fputcsv($out, ['date', 'bookings', 'food_orders', 'revenue_sar']);
                foreach ($rows as $r) {
                    fputcsv($out, [$r['day'], $r['bookings'], $r['orders'], number_format($r['revenue'], 2, '.', '')]);
                }
                fclose($out);
            }, 'alabiq-report-' . $from->toDateString() . '-to-' . $to->toDateString() . '.csv');
        }

        return view('admin.reports', [
            'rows' => $rows,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => [
                'bookings' => $rows->sum('bookings'),
                'orders' => $rows->sum('orders'),
                'revenue' => $rows->sum('revenue'),
            ],
        ]);
    }

    public function errors(Request $request)
    {
        $errorLogs = DB::table('error_logs')
            ->when($request->filled('severity'), fn ($q) => $q->where('severity', $request->string('severity')))
            ->orderByDesc('occurred_at')
            ->paginate(20)
            ->withQueryString();

        return view('admin.errors', ['errorLogs' => $errorLogs]);
    }

    public function admins()
    {
        $admins = Profile::query()
            ->where('role', 'admin')
            ->orWhere('is_super_admin', true)
            ->with('user:id,email,last_login_at')
            ->orderByDesc('is_super_admin')
            ->orderBy('full_name')
            ->get();

        $loginEvents = DB::table('admin_login_events')
            ->orderByDesc('occurred_at')
            ->take(20)
            ->get();

        return view('admin.admins', ['admins' => $admins, 'loginEvents' => $loginEvents]);
    }

    public function accounts(Request $request)
    {
        $accounts = Profile::query()
            ->with('user:id,email,disabled_at')
            ->when($request->filled('role'), fn ($q) => $q->where('role', $request->string('role')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = '%' . $request->string('q') . '%';
                $q->where(fn ($inner) => $inner
                    ->where('full_name', $this->likeOp(), $term)
                    ->orWhere('email', $this->likeOp(), $term));
            })
            ->orderByDesc('created_at')
            ->paginate(25)
            ->withQueryString();

        $roleCounts = Profile::query()->select('role', DB::raw('count(*) as n'))->groupBy('role')->pluck('n', 'role');

        return view('admin.accounts', [
            'accounts' => $accounts,
            'roleCounts' => $roleCounts,
            'roles' => ['passenger', 'driver', 'merchant', 'admin'],
        ]);
    }

    public function integrations()
    {
        $credentials = DB::table('partner_credentials')
            ->orderByDesc('created_at')
            ->get();

        $webhookEvents = DB::table('webhook_events')
            ->orderByDesc('created_at')
            ->take(30)
            ->get();

        return view('admin.integrations', [
            'credentials' => $credentials,
            'webhookEvents' => $webhookEvents,
            'partnerApiEnabled' => (bool) config('services.partner_api_enabled', false),
        ]);
    }

    public function settings()
    {
        $settings = DB::table('app_settings')->orderBy('key')->get();

        return view('admin.settings', ['settings' => $settings]);
    }

    /**
     * Admin-editable runtime settings — the same app_settings table the
     * Express settings.js repository owns. Values are stored as jsonb: keep
     * valid JSON as-is, otherwise store the raw string.
     */
    public function updateSetting(Request $request, string $key)
    {
        $value = $request->input('value');
        abort_if($value === null || $value === '', 422, 'A value is required.');

        $decoded = json_decode($value, true);
        $stored = json_last_error() === JSON_ERROR_NONE ? json_encode($decoded) : json_encode($value);

        // pgsql needs an explicit jsonb cast for query-builder inserts;
        // mysql accepts the JSON string as-is.
        if (DB::connection()->getDriverName() === 'pgsql') {
            $payload['value'] = DB::raw("'" . str_replace("'", "''", $stored) . "'::jsonb");
        } else {
            $payload['value'] = $stored;
        }

        // auth default is the API guard — the portal runs on the session guard.
        $payload['updated_by'] = \Illuminate\Support\Facades\Auth::guard('web')->id();

        DB::table('app_settings')->updateOrInsert(['key' => $key], $payload);

        return back()->with('status', "Setting \"{$key}\" updated.");
    }

    /**
     * Case-insensitive match on pgsql, plain LIKE elsewhere (MySQL shared
     * hosting is case-insensitive by collation anyway).
     */
    private function likeOp(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }

    private function greeting(): string
    {
        $hour = now()->hour;

        return $hour < 12 ? 'Good morning' : ($hour < 18 ? 'Good afternoon' : 'Good evening');
    }

    private function bookingStatuses(): array
    {
        return [
            'pending_payment', 'payment_under_review', 'confirmed', 'driver_assigned',
            'driver_on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled',
        ];
    }
}
