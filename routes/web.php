<?php

use App\Http\Controllers\Admin\PagesController as AdminPagesController;
use App\Http\Controllers\AuthPageController;
use App\Http\Controllers\PageController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web (Blade) routes — the Laravel port of the archived React frontend.
| The API lives in routes/api.php; nothing here touches the app_session
| guard except through the `web` session guard.
|--------------------------------------------------------------------------
*/

// --- Public marketing site ---------------------------------------------
Route::get('/', [PageController::class, 'home'])->name('home');
Route::get('/services', [PageController::class, 'services'])->name('services');
Route::get('/services/food', [PageController::class, 'servicesFood'])->name('services.food');
Route::get('/services/shop', [PageController::class, 'servicesShop'])->name('services.shop');
Route::get('/services/pick-drop', [PageController::class, 'servicesPickDrop'])->name('services.pick-drop');
Route::get('/support', [PageController::class, 'support'])->name('support');
Route::get('/help-center', [PageController::class, 'helpCenter'])->name('help-center');

// Legal — must stay public (store reviewers and Play policy open these logged out).
Route::get('/privacy-policy', [PageController::class, 'privacyPolicy'])->name('privacy-policy');
Route::get('/terms-of-service', [PageController::class, 'termsOfService'])->name('terms-of-service');
Route::get('/cookie-preferences', [PageController::class, 'cookiePreferences'])->name('cookie-preferences');
Route::get('/account-deletion', [PageController::class, 'accountDeletion'])->name('account-deletion');

// Demo pages — unlisted, fixture data only, nothing here touches the database
// (Blade port of the archived React /demo/restaurant sales-demo page).
Route::get('/demo/restaurant', [PageController::class, 'demoRestaurant'])->name('demo.restaurant');

// --- Session auth (admin portal) ----------------------------------------
Route::get('/login', [AuthPageController::class, 'showLogin'])->name('login');
Route::post('/login', [AuthPageController::class, 'login'])->middleware('throttle:20,1');
Route::post('/logout', [AuthPageController::class, 'logout'])->name('logout');

// --- Admin portal (Blade) -------------------------------------------------
Route::prefix('admin')->name('admin.')->middleware('admin.web')->group(function () {
    Route::get('/', [AdminPagesController::class, 'dashboard'])->name('dashboard');
    Route::get('/bookings', [AdminPagesController::class, 'bookings'])->name('bookings');
    Route::get('/drivers', [AdminPagesController::class, 'drivers'])->name('drivers');
    Route::post('/drivers/{driver}/approval', [AdminPagesController::class, 'updateDriverApproval'])->name('drivers.approval');
    Route::get('/restaurant-orders', [AdminPagesController::class, 'restaurantOrders'])->name('restaurant-orders');
    Route::get('/food', [AdminPagesController::class, 'food'])->name('food');
    Route::get('/shop', [AdminPagesController::class, 'shop'])->name('shop');
    Route::get('/reports', [AdminPagesController::class, 'reports'])->name('reports');
    Route::get('/errors', [AdminPagesController::class, 'errors'])->name('errors');
    Route::get('/admins', [AdminPagesController::class, 'admins'])->name('admins');
    Route::get('/accounts', [AdminPagesController::class, 'accounts'])->name('accounts');
    Route::get('/integrations', [AdminPagesController::class, 'integrations'])->name('integrations');
    Route::get('/settings', [AdminPagesController::class, 'settings'])->name('settings');
    Route::post('/settings/{key}', [AdminPagesController::class, 'updateSetting'])->name('settings.update');
});
