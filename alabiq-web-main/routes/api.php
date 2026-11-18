<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BookingsController;
use App\Http\Controllers\TrackingController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\DriverController;
use App\Http\Controllers\MerchantController;
use App\Http\Controllers\Food\RestaurantsController;
use App\Http\Controllers\Food\CartController as FoodCartController;
use App\Http\Controllers\Food\OrdersController as FoodOrdersController;
use App\Http\Controllers\Food\EventsController as FoodEventsController;
use App\Http\Controllers\Shop\StoresController;
use App\Http\Controllers\Shop\CartController as ShopCartController;
use App\Http\Controllers\Shop\OrdersController as ShopOrdersController;
use App\Http\Controllers\Shop\EventsController as ShopEventsController;
use App\Http\Controllers\PaymentsController;
use App\Http\Controllers\CardPaymentsController;
use App\Http\Controllers\PaymentMethodsController;
use App\Http\Controllers\NotificationsController;
use App\Http\Controllers\FilesController;
use App\Http\Controllers\Partner\DeliveriesController as PartnerDeliveriesController;
use App\Http\Controllers\PublicTrackingController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\LocationsController;
use App\Http\Controllers\RouteController;
use App\Http\Controllers\EventsController;

// Health check
Route::get('/health', [HealthController::class, 'index']);

// Auth routes
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::get('/session', [AuthController::class, 'session'])->middleware('auth');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth');
    Route::post('/password', [AuthController::class, 'changePassword'])->middleware('auth');
    Route::post('/password/reset/request', [AuthController::class, 'requestPasswordReset']);
    Route::post('/password/reset/exchange', [AuthController::class, 'exchangePasswordReset']);
    Route::post('/password/reset/complete', [AuthController::class, 'completePasswordReset']);
    Route::post('/signup', [AuthController::class, 'signup'])->middleware('throttle:signup');
    Route::post('/sync', [AuthController::class, 'syncProfile'])->middleware('auth');
    Route::post('/login-event', [AuthController::class, 'recordLoginEvent'])->middleware('auth');
    Route::patch('/profile', [AuthController::class, 'updateProfile'])->middleware('auth');
    Route::post('/avatar/signed-url', [AuthController::class, 'createAvatarUploadUrl'])->middleware('auth');
    Route::delete('/account', [AuthController::class, 'deleteAccount'])->middleware('auth');
});
// Bookings
Route::prefix('bookings')->middleware('auth')->group(function () {
    Route::post('/', [BookingsController::class, 'createBooking']);
    Route::get('/', [BookingsController::class, 'listMyBookings']);
    Route::get('/{bookingCode}', [BookingsController::class, 'getBookingByCode'])->middleware('throttle:booking_lookup');
    Route::post('/{bookingCode}/cancel', [BookingsController::class, 'cancelBooking']);
    Route::patch('/{bookingCode}/contact', [BookingsController::class, 'updateBookingContact']);
    Route::post('/{code}/rate-driver', [BookingsController::class, 'rateRideDriver']);

    // Payments
    Route::get('/{bookingCode}/payment-instructions', [BookingsController::class, 'getPaymentInstructions']);
    Route::post('/{bookingCode}/payment-proof/signed-url', [BookingsController::class, 'createProofUploadUrl'])->middleware('throttle:booking_proof');
    Route::post('/{bookingCode}/payment-proof', [BookingsController::class, 'recordPaymentProof'])->middleware('throttle:booking_proof');
});

// Tracking (public)
Route::get('/tracking/{bookingCode}', [TrackingController::class, 'getTracking'])->middleware('throttle:booking_lookup');

// Admin
Route::prefix('admin')->middleware(['auth', 'admin'])->group(function () {
    Route::get('/stats', [AdminController::class, 'getStats']);
    Route::get('/reports', [AdminController::class, 'getReports']);

    // Bookings
    Route::get('/bookings', [AdminController::class, 'listBookings']);
    Route::get('/bookings/{bookingCode}', [AdminController::class, 'getBookingDetail']);
    Route::post('/bookings/{bookingCode}/verify-payment', [AdminController::class, 'verifyPayment']);
    Route::post('/bookings/{bookingCode}/reject-payment', [AdminController::class, 'rejectPayment']);
    Route::post('/bookings/{bookingCode}/assign-driver', [AdminController::class, 'assignDriver']);

    // Drivers
    Route::get('/drivers', [AdminController::class, 'listDrivers']);
    Route::post('/drivers/{driverId}/approval', [AdminController::class, 'setDriverApproval']);
    Route::get('/drivers/cash', [AdminController::class, 'listDriverCash']);
    Route::post('/drivers/{driverId}/settle-cash', [AdminController::class, 'settleDriverCash']);
    Route::get('/drivers/{driverId}/documents', [AdminController::class, 'listDriverDocuments']);
    Route::post('/drivers/{driverId}/documents/{docId}/review', [AdminController::class, 'reviewDriverDocument']);

    // Errors
    Route::get('/errors', [AdminController::class, 'listErrors']);
    Route::get('/errors/summary', [AdminController::class, 'errorSummary']);
    Route::get('/errors/{id}', [AdminController::class, 'getError']);
    Route::post('/errors/{id}/resolve', [AdminController::class, 'resolveError']);

    // Admins
    Route::get('/admins', [AdminController::class, 'listAdmins']);
    Route::post('/admins', [AdminController::class, 'createAdmin']);
    Route::patch('/admins/{id}', [AdminController::class, 'updateAdmin']);
    Route::post('/admins/{id}/deactivate', [AdminController::class, 'deactivateAdmin']);
    Route::post('/admins/{id}/reactivate', [AdminController::class, 'reactivateAdmin']);
    Route::post('/admins/{id}/password', [AdminController::class, 'setAdminPassword']);

    // Food admin
    Route::prefix('food')->group(function () {
        Route::get('/merchants', [AdminController::class, 'listFoodMerchants']);
        Route::post('/merchants', [AdminController::class, 'createFoodMerchant']);
        Route::patch('/merchants/{id}', [AdminController::class, 'updateFoodMerchant']);
        Route::post('/merchants/{id}/owner', [AdminController::class, 'setFoodMerchantOwner']);
        Route::post('/merchants/{id}/owner/password', [AdminController::class, 'setFoodMerchantOwnerPassword']);

        Route::get('/categories', [AdminController::class, 'listFoodCategories']);
        Route::post('/categories', [AdminController::class, 'createFoodCategory']);
        Route::patch('/categories/{id}', [AdminController::class, 'updateFoodCategory']);
        Route::delete('/categories/{id}', [AdminController::class, 'deleteFoodCategory']);

        Route::get('/items', [AdminController::class, 'listFoodItems']);
        Route::post('/items', [AdminController::class, 'createFoodItem']);
        Route::patch('/items/{id}', [AdminController::class, 'updateFoodItem']);
        Route::delete('/items/{id}', [AdminController::class, 'deleteFoodItem']);

        Route::get('/orders', [AdminController::class, 'listFoodOrders']);
        Route::get('/orders/{code}', [AdminController::class, 'getFoodOrderDetail']);
        Route::post('/orders/{code}/accept', [AdminController::class, 'acceptFoodOrder']);
        Route::post('/orders/{code}/reject', [AdminController::class, 'rejectFoodOrder']);
        Route::patch('/orders/{code}/status', [AdminController::class, 'advanceFoodOrderStatus']);
        Route::post('/orders/{code}/verify-payment', [AdminController::class, 'verifyFoodPayment']);
        Route::post('/orders/{code}/reject-payment', [AdminController::class, 'rejectFoodPayment']);
        Route::post('/orders/{code}/refund', [AdminController::class, 'refundFoodOrder']);
        Route::post('/orders/{code}/cancel', [AdminController::class, 'cancelFoodOrder']);
        Route::post('/orders/{code}/assign-driver', [AdminController::class, 'assignFoodDriver']);
        Route::get('/orders/{code}/photos', [AdminController::class, 'getFoodOrderPhotos']);

        Route::get('/refunds', [AdminController::class, 'listFoodRefunds']);
    });

    // Shop admin
    Route::prefix('shop')->group(function () {
        Route::get('/stores', [AdminController::class, 'listShops']);
        Route::post('/stores', [AdminController::class, 'createShop']);
        Route::patch('/stores/{id}', [AdminController::class, 'updateShop']);
        Route::post('/stores/{id}/owner', [AdminController::class, 'setShopOwner']);
        Route::post('/stores/{id}/owner/password', [AdminController::class, 'setShopOwnerPassword']);

        Route::get('/categories', [AdminController::class, 'listShopCategories']);
        Route::post('/categories', [AdminController::class, 'createShopCategory']);
        Route::patch('/categories/{id}', [AdminController::class, 'updateShopCategory']);
        Route::delete('/categories/{id}', [AdminController::class, 'deleteShopCategory']);

        Route::get('/products', [AdminController::class, 'listShopProducts']);
        Route::post('/products', [AdminController::class, 'createShopProduct']);
        Route::patch('/products/{id}', [AdminController::class, 'updateShopProduct']);
        Route::delete('/products/{id}', [AdminController::class, 'deleteShopProduct']);

        Route::get('/variants', [AdminController::class, 'listShopVariants']);
        Route::post('/products/{id}/variants', [AdminController::class, 'createShopVariant']);
        Route::patch('/products/{id}/variants/{variantId}', [AdminController::class, 'updateShopVariant']);
        Route::delete('/products/{id}/variants/{variantId}', [AdminController::class, 'deleteShopVariant']);

        Route::get('/inventory', [AdminController::class, 'getShopInventory']);

        Route::get('/orders', [AdminController::class, 'listShopOrders']);
        Route::post('/orders/{code}/accept', [AdminController::class, 'acceptShopOrder']);
        Route::post('/orders/{code}/reject', [AdminController::class, 'rejectShopOrder']);
        Route::patch('/orders/{code}/status', [AdminController::class, 'advanceShopOrderStatus']);
        Route::post('/orders/{code}/verify-payment', [AdminController::class, 'verifyShopPayment']);
        Route::post('/orders/{code}/reject-payment', [AdminController::class, 'rejectShopPayment']);
        Route::post('/orders/{code}/refund', [AdminController::class, 'refundShopOrder']);
        Route::post('/orders/{code}/cancel', [AdminController::class, 'cancelShopOrder']);
        Route::post('/orders/{code}/assign-driver', [AdminController::class, 'assignShopDriver']);
        Route::get('/orders/{code}/photos', [AdminController::class, 'getShopOrderPhotos']);

        Route::get('/settlement', [AdminController::class, 'getShopSettlement']);
    });

    // Partner admin
    Route::prefix('partner')->group(function () {
        Route::get('/credentials', [AdminController::class, 'listPartnerCredentials']);
        Route::post('/credentials', [AdminController::class, 'createPartnerCredential']);
        Route::post('/credentials/{id}/revoke', [AdminController::class, 'revokePartnerCredential']);
        Route::post('/credentials/{id}/rotate', [AdminController::class, 'rotatePartnerCredential']);

        Route::get('/webhook-endpoints', [AdminController::class, 'listPartnerWebhookEndpoints']);
        Route::post('/webhook-endpoints', [AdminController::class, 'createPartnerWebhookEndpoint']);
        Route::patch('/webhook-endpoints/{id}', [AdminController::class, 'updatePartnerWebhookEndpoint']);
        Route::delete('/webhook-endpoints/{id}', [AdminController::class, 'deletePartnerWebhookEndpoint']);
        Route::get('/webhook-endpoints/{id}/deliveries', [AdminController::class, 'getPartnerWebhookDeliveries']);
        Route::post('/webhook-endpoints/{id}/deliveries/{deliveryId}/replay', [AdminController::class, 'replayPartnerWebhookDelivery']);
    });

    // Users
    Route::get('/users', [AdminController::class, 'listUsers']);
    Route::patch('/users/{id}/role', [AdminController::class, 'updateUserRole']);
    Route::post('/users/{id}/deactivate', [AdminController::class, 'deactivateUser']);
    Route::post('/users/{id}/reactivate', [AdminController::class, 'reactivateUser']);
    Route::post('/users/{id}/password', [AdminController::class, 'resetUserPassword']);
});

// Driver
Route::prefix('driver')->middleware('driver')->group(function () {
    Route::get('/available', [DriverController::class, 'listAvailableRides'])->middleware('driver.approved');
    Route::post('/location', [DriverController::class, 'updateDriverLocation'])->middleware(['driver.approved', 'throttle:driver_location']);
    Route::patch('/services', [DriverController::class, 'updateServiceTypes']);
    Route::get('/rides', [DriverController::class, 'listMyRides']);
    Route::post('/rides/{bookingCode}/status', [DriverController::class, 'updateRideStatus']);
    Route::get('/cash', [DriverController::class, 'getMyCash']);
    Route::post('/rides/{code}/cancel', [DriverController::class, 'cancelRide']);
    Route::post('/rides/{bookingCode}/accept', [DriverController::class, 'acceptRide'])->middleware(['driver.approved', 'throttle:driver_accept']);

    // Offers (Grab-style dispatch)
    Route::get('/offers', [DriverController::class, 'listOffers'])->middleware('driver.approved');
    Route::post('/offers/{id}/accept', [DriverController::class, 'acceptOffer'])->middleware(['driver.approved', 'throttle:driver_accept']);
    Route::post('/offers/{id}/decline', [DriverController::class, 'declineOffer'])->middleware(['driver.approved', 'throttle:driver_accept']);

    // Deliveries (food/shop)
    Route::get('/deliveries', [DriverController::class, 'listMyDeliveries']);
    Route::get('/deliveries/available', [DriverController::class, 'listOpenDeliveries'])->middleware('driver.approved');
    Route::post('/deliveries/{code}/claim', [DriverController::class, 'claimOpenDelivery'])->middleware(['driver.approved', 'throttle:driver_accept']);
    Route::post('/deliveries/{code}/cancel', [DriverController::class, 'cancelDelivery']);
    Route::post('/deliveries/{code}/photo-url', [DriverController::class, 'createDeliveryPhotoUrl']);
    Route::post('/deliveries/{code}/status', [DriverController::class, 'updateDeliveryStatus']);

    // Documents
    Route::post('/documents/signed-url', [DriverController::class, 'createDocUploadUrl']);
    Route::post('/documents', [DriverController::class, 'recordDriverDocument']);
    Route::get('/documents', [DriverController::class, 'listMyDocuments']);
});

// Merchant (food vertical)
Route::prefix('merchant')->middleware('merchant.vertical:food')->group(function () {
    Route::get('/me', [MerchantController::class, 'getProfile']);
    Route::get('/profile', [MerchantController::class, 'getProfile']);
    Route::patch('/profile', [MerchantController::class, 'updateProfile']);
    Route::post('/logo/signed-url', [MerchantController::class, 'createLogoUploadUrl']);
    Route::post('/logo/confirm', [MerchantController::class, 'confirmLogoUpload']);
    Route::post('/menu/items/image/signed-url', [MerchantController::class, 'createMenuItemImageUploadUrl']);
    Route::post('/menu/items/image/confirm', [MerchantController::class, 'confirmMenuItemImageUpload']);

    // Hours
    Route::get('/hours', [MerchantController::class, 'getHours']);
    Route::put('/hours', [MerchantController::class, 'setHours']);
    Route::patch('/accepting-orders', [MerchantController::class, 'setAcceptingOrders']);

    // Analytics
    Route::get('/analytics', [MerchantController::class, 'getAnalytics']);

    // Menu
    Route::get('/menu', [MerchantController::class, 'getMenu']);
    Route::post('/menu/categories', [MerchantController::class, 'addCategory']);
    Route::patch('/menu/categories/{id}', [MerchantController::class, 'updateCategory']);
    Route::delete('/menu/categories/{id}', [MerchantController::class, 'deleteCategory']);
    Route::post('/menu/items', [MerchantController::class, 'addItem']);
    Route::patch('/menu/items/{id}', [MerchantController::class, 'updateItem']);
    Route::delete('/menu/items/{id}', [MerchantController::class, 'deleteItem']);

    // Orders
    Route::get('/orders', [MerchantController::class, 'listOrders']);
    Route::post('/orders/{code}/accept', [MerchantController::class, 'acceptOrder']);
    Route::post('/orders/{code}/reject', [MerchantController::class, 'rejectOrder']);
    Route::patch('/orders/{code}/status', [MerchantController::class, 'advanceStatus']);
    Route::post('/orders/{code}/cancel', [MerchantController::class, 'cancelOrder']);
});

// Food (customer-facing)
Route::prefix('food')->group(function () {
    // Discovery
    Route::get('/restaurants', [RestaurantsController::class, 'listRestaurants'])->middleware(['throttle:food_search', 'food.auth']);
    Route::get('/restaurants/{id}', [RestaurantsController::class, 'getRestaurant'])->middleware(['throttle:food_search', 'food.auth']);

    // Cart
    Route::get('/cart', [FoodCartController::class, 'getCart'])->middleware('auth');
    Route::post('/cart/items', [FoodCartController::class, 'addCartItem'])->middleware('auth');
    Route::patch('/cart/items/{id}', [FoodCartController::class, 'updateCartItem'])->middleware('auth');
    Route::delete('/cart/items/{id}', [FoodCartController::class, 'removeCartItem'])->middleware('auth');

    // Orders
    Route::post('/orders', [FoodOrdersController::class, 'checkout'])->middleware(['auth', 'throttle:food_checkout', 'idempotency']);
    Route::get('/orders', [FoodOrdersController::class, 'listOrders'])->middleware('auth');
    Route::get('/orders/{code}', [FoodOrdersController::class, 'getOrder'])->middleware('auth');
    Route::patch('/orders/{code}/contact', [FoodOrdersController::class, 'updateOrderContact'])->middleware('auth');

    // Payment
    Route::get('/orders/{code}/pay', [FoodOrdersController::class, 'getPaymentInfo'])->middleware('auth');
    Route::post('/orders/{code}/pay/signed-url', [FoodOrdersController::class, 'createPayUploadUrl'])->middleware(['auth', 'throttle:food_pay']);
    Route::post('/orders/{code}/pay', [FoodOrdersController::class, 'recordPayment'])->middleware(['auth', 'throttle:food_pay', 'idempotency']);
    Route::post('/orders/{code}/charge', [FoodOrdersController::class, 'createCardCharge'])->middleware(['auth', 'throttle:card_charge', 'idempotency']);

    // Rating
    Route::post('/orders/{code}/rate-driver', [FoodOrdersController::class, 'rateFoodDriver'])->middleware('auth');

    // Events
    Route::post('/events', [FoodEventsController::class, 'recordEvent'])->middleware(['throttle:food_events', 'food.auth']);
});

// Shop (customer-facing) - feature flagged
Route::prefix('shop')->middleware('feature:shop')->group(function () {
    Route::get('/stores', [StoresController::class, 'listStores'])->middleware(['throttle:shop_search', 'food.auth']);
    Route::get('/stores/{id}', [StoresController::class, 'getStore'])->middleware(['throttle:shop_search', 'food.auth']);

    Route::get('/cart', [ShopCartController::class, 'getCart'])->middleware('auth');
    Route::post('/cart/items', [ShopCartController::class, 'addCartItem'])->middleware('auth');
    Route::patch('/cart/items/{id}', [ShopCartController::class, 'updateCartItem'])->middleware('auth');
    Route::delete('/cart/items/{id}', [ShopCartController::class, 'removeCartItem'])->middleware('auth');

    Route::post('/orders', [ShopOrdersController::class, 'checkout'])->middleware(['auth', 'throttle:shop_checkout', 'idempotency']);
    Route::get('/orders', [ShopOrdersController::class, 'listOrders'])->middleware('auth');
    Route::get('/orders/{code}', [ShopOrdersController::class, 'getOrder'])->middleware('auth');
    Route::patch('/orders/{code}/contact', [ShopOrdersController::class, 'updateOrderContact'])->middleware('auth');

    Route::get('/orders/{code}/pay', [ShopOrdersController::class, 'getPaymentInfo'])->middleware('auth');
    Route::post('/orders/{code}/pay/signed-url', [ShopOrdersController::class, 'createPayUploadUrl'])->middleware(['auth', 'throttle:shop_pay']);
    Route::post('/orders/{code}/pay', [ShopOrdersController::class, 'recordPayment'])->middleware(['auth', 'throttle:shop_pay', 'idempotency']);
    Route::post('/orders/{code}/charge', [ShopOrdersController::class, 'createCardCharge'])->middleware(['auth', 'throttle:card_charge', 'idempotency']);

    Route::post('/orders/{code}/rate-driver', [ShopOrdersController::class, 'rateShopDriver'])->middleware('auth');
    Route::post('/events', [ShopEventsController::class, 'recordEvent'])->middleware(['throttle:shop_events', 'food.auth']);
});

// Merchant Shop (shop vertical)
Route::prefix('merchant/shop')->middleware('merchant.vertical:shop')->group(function () {
    Route::get('/profile', [MerchantController::class, 'getShopProfile']);
    Route::patch('/profile', [MerchantController::class, 'updateShopProfile']);
    Route::post('/images/signed-url', [MerchantController::class, 'createShopImageUploadUrl']);

    Route::get('/hours', [MerchantController::class, 'getHours']);
    Route::put('/hours', [MerchantController::class, 'setHours']);
    Route::patch('/accepting-orders', [MerchantController::class, 'setAcceptingOrders']);

    Route::get('/catalogue', [MerchantController::class, 'getCatalogue']);
    Route::get('/analytics', [MerchantController::class, 'getAnalytics']);

    Route::post('/categories', [MerchantController::class, 'addShopCategory']);
    Route::patch('/categories/{id}', [MerchantController::class, 'updateShopCategory']);
    Route::delete('/categories/{id}', [MerchantController::class, 'deleteShopCategory']);

    Route::post('/products', [MerchantController::class, 'addProduct']);
    Route::patch('/products/{id}', [MerchantController::class, 'updateProduct']);
    Route::delete('/products/{id}', [MerchantController::class, 'deleteProduct']);

    Route::post('/products/{id}/variants', [MerchantController::class, 'addVariant']);
    Route::patch('/products/{id}/variants/{variantId}', [MerchantController::class, 'updateVariant']);
    Route::delete('/products/{id}/variants/{variantId}', [MerchantController::class, 'deleteVariant']);

    Route::get('/inventory', [MerchantController::class, 'getInventory']);
    Route::patch('/products/{id}/stock', [MerchantController::class, 'setStock']);

    Route::get('/orders', [MerchantController::class, 'listShopOrders']);
    Route::post('/orders/{code}/accept', [MerchantController::class, 'acceptShopOrder']);
    Route::post('/orders/{code}/reject', [MerchantController::class, 'rejectShopOrder']);
    Route::patch('/orders/{code}/status', [MerchantController::class, 'advanceShopOrderStatus']);
    Route::post('/orders/{code}/cancel', [MerchantController::class, 'cancelShopOrder']);
});

// Payments
Route::prefix('payments')->group(function () {
    // Webhook - no auth, own rate limiter
    Route::post('/webhooks/tap', [PaymentsController::class, 'tapWebhook'])->middleware('throttle:webhook');

    // Config
    Route::get('/config', [PaymentsController::class, 'config']);

    // Card charges
    Route::post('/bookings/{code}/charge', [CardPaymentsController::class, 'createBookingCardCharge'])
        ->middleware(['auth', 'throttle:card_charge', 'idempotency']);
    Route::post('/charges/{chargeId}/verify', [CardPaymentsController::class, 'verifyCharge'])
        ->middleware(['auth', 'throttle:payment_methods']);
});

// Payment Methods
Route::prefix('payment-methods')->middleware('auth')->group(function () {
    Route::get('/', [PaymentMethodsController::class, 'listPaymentMethods'])->middleware('throttle:payment_methods');
    Route::delete('/{id}', [PaymentMethodsController::class, 'deletePaymentMethod'])->middleware('throttle:payment_methods_write');
    Route::post('/{id}/default', [PaymentMethodsController::class, 'makeDefault'])->middleware('throttle:payment_methods_write');
});

// Files
Route::prefix('files')->group(function () {
    Route::post('/upload', [FilesController::class, 'upload']);
    Route::get('/private', [FilesController::class, 'privateDownload']);
    Route::get('/public/{bucket}/{path}', [FilesController::class, 'publicDownload'])->where('path', '.*');
});

// Events (SSE)
Route::get('/events', [EventsController::class, 'stream'])->middleware('auth');

// Locations (Mapbox)
Route::prefix('locations')->group(function () {
    Route::get('/search', [LocationsController::class, 'search'])->middleware('throttle:location_search');
    Route::get('/details', [LocationsController::class, 'details'])->middleware('throttle:location_search');
    Route::get('/reverse', [LocationsController::class, 'reverse'])->middleware('throttle:location_reverse');
    Route::get('/nearby', [LocationsController::class, 'nearby'])->middleware('throttle:location_nearby');
});

// Route (Mapbox Directions)
Route::get('/route', [RouteController::class, 'computeRoute'])->middleware('throttle:route');

// Notifications
Route::prefix('notifications')->middleware('auth')->group(function () {
    Route::get('/push-config', [NotificationsController::class, 'pushConfig']);
    Route::post('/register', [NotificationsController::class, 'registerToken']);
    Route::post('/unregister', [NotificationsController::class, 'unregisterToken']);
    Route::get('/', [NotificationsController::class, 'listMyNotifications']);
    Route::patch('/read', [NotificationsController::class, 'markAllRead']);
});

// Partner API - feature flagged
Route::prefix('partner')->middleware(['feature:partner_api', 'partner.auth'])->group(function () {
    Route::post('/delivery-quotes', [PartnerDeliveriesController::class, 'createQuote'])->middleware('throttle:partner_api');
    Route::post('/deliveries', [PartnerDeliveriesController::class, 'createDelivery'])->middleware('throttle:partner_api');
    Route::get('/deliveries/{id}', [PartnerDeliveriesController::class, 'getDelivery']);
    Route::post('/deliveries/{id}/cancel', [PartnerDeliveriesController::class, 'cancelDelivery']);
    Route::post('/deliveries/{id}/preparation', [PartnerDeliveriesController::class, 'updatePreparation']);
    Route::post('/deliveries/{id}/tracking-token/rotate', [PartnerDeliveriesController::class, 'rotateTrackingToken']);

    Route::get('/credentials', [PartnerDeliveriesController::class, 'listCredentials']);
    Route::post('/credentials', [PartnerDeliveriesController::class, 'createCredential']);
    Route::post('/credentials/{id}/revoke', [PartnerDeliveriesController::class, 'revokeCredential']);
    Route::post('/credentials/{id}/rotate', [PartnerDeliveriesController::class, 'rotateCredential']);

    Route::get('/webhook-endpoints', [PartnerDeliveriesController::class, 'listWebhookEndpoints']);
    Route::post('/webhook-endpoints', [PartnerDeliveriesController::class, 'createWebhookEndpoint']);
    Route::patch('/webhook-endpoints/{id}', [PartnerDeliveriesController::class, 'updateWebhookEndpoint']);
    Route::delete('/webhook-endpoints/{id}', [PartnerDeliveriesController::class, 'deleteWebhookEndpoint']);
    Route::get('/webhook-endpoints/{id}/deliveries', [PartnerDeliveriesController::class, 'getWebhookDeliveries']);
    Route::post('/webhook-endpoints/{id}/deliveries/{deliveryId}/replay', [PartnerDeliveriesController::class, 'replayWebhookDelivery']);
});

// Public Tracking
Route::prefix('public')->group(function () {
    Route::get('/{trackingId}', [PublicTrackingController::class, 'getPublicTracking'])->middleware('throttle:booking_lookup');
    Route::get('/{trackingId}/stream', [PublicTrackingController::class, 'getPublicTrackingSSE'])->middleware('throttle:booking_lookup');
});

// Root
Route::get('/', function () {
    return response()->json(['name' => 'Alabiq API', 'status' => 'running']);
});

// 404 fallback
Route::fallback(function () {
    return response()->json(['error' => 'Not found'], 404);
});
