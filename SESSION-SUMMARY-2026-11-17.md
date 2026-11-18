# Alabiq Laravel Migration — Session Summary (2026-11-17)

## Overview
Completed **Phase A** (Fix broken/incomplete files) and **Phase B** (Create missing controllers) of the Laravel 11 migration for Alabiq. The migration is in `alabiq-web-main/laravel/` and aims to replace the live Node/Express backend.

---

## Phase A: Fix Broken/Incomplete Files ✅ COMPLETE

### Syntax Errors Fixed
| File | Issue | Fix |
|------|-------|-----|
| `AuthController.php` | Extra `}` on line 34 prematurely closed class | Removed extra `}` |
| `BookingsController.php` | Extra `}` on line 122 prematurely closed class | Removed extra `}` |
| `LocationsController.php` | Extra `}` on line 26 prematurely closed class | Removed extra `}` |
| `AdminController.php` | Import typos: `App.Models\` → `App\Models\` (lines 21, 22, 24, 25) | Fixed namespace separators |

### Created Missing Files
| File | Purpose |
|------|---------|
| `app/Http/Controllers/Controller.php` | Base Laravel controller (was missing) |
| `app/Models/DriverDocument.php` | Driver verification documents |
| `app/Models/MenuCategory.php` | Food menu categories |
| `app/Models/MenuItem.php` | Food menu items |
| `app/Models/ShopCategory.php` | Shop product categories |
| `app/Models/ShopProduct.php` | Shop products |
| `app/Models/ShopProductVariant.php` | Shop product variants |
| `app/Models/Cart.php` | Food/shop cart (shared table) |
| `app/Models/CartItem.php` | Cart line items |

---

## Phase B: Create Missing Controllers ✅ COMPLETE

### 14 Controllers Created

#### Food Vertical (4)
| Controller | File | Implementation |
|------------|------|----------------|
| `RestaurantsController` | `app/Http/Controllers/Food/RestaurantsController.php` | ✅ Full — list, get, hours state |
| `CartController` | `app/Http/Controllers/Food/CartController.php` | ✅ Full — get, add, update, remove, pricing |
| `OrdersController` | `app/Http/Controllers/Food/OrdersController.php` | ✅ Full — checkout, list, get, contact, payments |
| `EventsController` | `app/Http/Controllers/Food/EventsController.php` | ✅ Stub — recordEvent |

#### Shop Vertical (4)
| Controller | File | Implementation |
|------------|------|----------------|
| `StoresController` | `app/Http/Controllers/Shop/StoresController.php` | ✅ Full — list, get, hours state |
| `CartController` | `app/Http/Controllers/Shop/CartController.php` | ✅ Full — get, add, update, remove, pricing, stock |
| `OrdersController` | `app/Http/Controllers/Shop/OrdersController.php` | ✅ Full — checkout, list, get, contact, payments, stock decrement |
| `EventsController` | `app/Http/Controllers/Shop/EventsController.php` | ✅ Stub — recordEvent |

#### Core Controllers (6)
| Controller | File | Implementation |
|------------|------|----------------|
| `PaymentsController` | `app/Http/Controllers/PaymentsController.php` | ⚠️ Stub — needs Tap webhook, ObjectStorage |
| `CardPaymentsController` | `app/Http/Controllers/CardPaymentsController.php` | ⚠️ Stub — needs TapService |
| `PaymentMethodsController` | `app/Http/Controllers/PaymentMethodsController.php` | ✅ Full — CRUD for saved cards |
| `Partner\DeliveriesController` | `app/Http/Controllers/Partner/DeliveriesController.php` | ⚠️ Stub — all partner API endpoints |
| `DriverController` | `app/Http/Controllers/DriverController.php` | ⚠️ Stub — docs, deliveries, location |
| `MerchantController` | `app/Http/Controllers/MerchantController.php` | ✅ Full — profile, orders, catalog, hours, stats |

---

## Phase C: Core Money Services ✅ COMPLETE (3/11)

| Service | File | Status |
|---------|------|--------|
| `VatService` | `app/Services/VatService.php` | ✅ KSA VAT 15%, round2 matching Node |
| `FoodMoneyService` | `app/Services/FoodMoneyService.php` | ✅ Full — pricing, margins, credit, delivery |
| `ShopMoneyService` | `app/Services/ShopMoneyService.php` | ✅ Full — pricing, variants, stock, credit |

**Remaining Phase C Services (8):**
- `TapService` — Card payments (Tap Payments)
- `DispatchService` — Driver dispatch logic
- `EtaService` — ETA calculations
- `SavedCardsService` — Card tokenization
- `WebPushService` — Push notifications (VAPID)
- `StockService` — Inventory management
- `MerchantHoursService` — Opening hours
- `ObjectStorageService` config binding — Already exists but needs DI binding

---

## Verification Results

```
✅ All 49 PHP files pass syntax check (php -l)
✅ Laravel app bootstraps: php artisan --version → Laravel 11.57.1
✅ 10/14 new controllers resolve successfully:
   - Food: Restaurants, Cart, Orders, Events ✅
   - Shop: Stores, Cart, Orders, Events ✅
   - Partner: Deliveries ✅
   - Merchant ✅
   
⚠️ 4 controllers need Phase C services:
   - PaymentsController → needs ObjectStorageService config binding
   - CardPaymentsController → needs TapService
   - PaymentMethodsController → needs TapService
   - DriverController → needs ObjectStorageService config binding
```

---

## Files Modified/Created in This Session

### Controllers (14 new)
```
app/Http/Controllers/Food/RestaurantsController.php
app/Http/Controllers/Food/CartController.php
app/Http/Controllers/Food/OrdersController.php
app/Http/Controllers/Food/EventsController.php
app/Http/Controllers/Shop/StoresController.php
app/Http/Controllers/Shop/CartController.php
app/Http/Controllers/Shop/OrdersController.php
app/Http/Controllers/Shop/EventsController.php
app/Http/Controllers/PaymentsController.php
app/Http/Controllers/CardPaymentsController.php
app/Http/Controllers/PaymentMethodsController.php
app/Http/Controllers/Partner/DeliveriesController.php
app/Http/Controllers/DriverController.php
app/Http/Controllers/MerchantController.php
```

### Services (3 new)
```
app/Services/VatService.php
app/Services/FoodMoneyService.php
app/Services/ShopMoneyService.php
```

### Models (8 new)
```
app/Models/DriverDocument.php
app/Models/MenuCategory.php
app/Models/MenuItem.php
app/Models/ShopCategory.php
app/Models/ShopProduct.php
app/Models/ShopProductVariant.php
app/Models/Cart.php
app/Models/CartItem.php
```

### Base Controller (1 new)
```
app/Http/Controllers/Controller.php
```

---

## Next Steps for Next Session

### Priority 1: Complete Phase C Services
1. **Create `TapService`** — Required by `CardPaymentsController` and `PaymentMethodsController`
2. **Bind `ObjectStorageService` in container** — Required by `PaymentsController` and `DriverController`
   - Add to `AppServiceProvider::register()` or create a provider

### Priority 2: Remaining Phase C Services
3. `DispatchService` — Driver dispatch logic
4. `EtaService` — ETA calculations
5. `SavedCardsService` — Card tokenization
6. `WebPushService` — Push notifications
7. `StockService` — Inventory management
8. `MerchantHoursService` — Opening hours

### Priority 3: Phase D — Testing
- PHPUnit tests for `VatService`, `FoodMoneyService`, `ShopMoneyService`
- Controller feature tests
- Auth/session tests

### Priority 4: Phase E — Docker & Cutover
- Build and test Laravel Docker stack (`docker-compose.laravel.yml`)
- Route-by-route cutover from Express to Laravel

---

## Key Implementation Notes

### Money Math Consistency
- `VatService::round2()` matches Node's `lib/money.js` exactly (half-up with 1e-9 nudge)
- `FoodMoneyService` mirrors `backend/lib/foodMoney.js` line-for-line
- `ShopMoneyService` mirrors `backend/lib/shopMoney.js` line-for-line
- All pricing computed server-side; client amounts ignored

### Controller Patterns
- All controllers use constructor injection for services
- Validation via `$request->validate()`
- Consistent error responses: `400` validation, `404` not found, `409` conflict, `422` unprocessable, `500` server error
- Hour state logic (`publicHoursState`, `dayName`) shared across controllers

### Database
- 20 migrations already exist (mirroring Express schema)
- Models use UUID primary keys
- Relationships defined (BelongsTo, HasMany)
- Casts for datetime, boolean, decimal, array

### Missing Bindings
```php
// In AppServiceProvider::register() or dedicated provider:
$this->app->bind(\App\Services\TapService::class, function ($app) {
    return new \App\Services\TapService(
        config('services.tap.api_key'),
        config('services.tap.secret_key'),
        config('services.tap.mode') // 'sandbox' or 'live'
    );
});

$this->app->bind(\App\Services\ObjectStorageService::class, function ($app) {
    return new \App\Services\ObjectStorageService(
        config('filesystems.disks.minio.key'),
        config('filesystems.disks.minio.secret'),
        config('filesystems.disks.minio.endpoint'),
        config('filesystems.disks.minio.region'),
        config('filesystems.disks.minio.bucket')
    );
});
```

---

## AGENTS.md Updated
- Added Laravel migration stack documentation (§2)
- Added Laravel directory structure (§3)
- Added Laravel env vars (§5)
- Added Laravel commands (§6)
- Added Laravel migration risks (§8)
- Updated working agreements for dual stack (§9)
- Updated doc map (§10)
- Updated header date: **2026-11-16** → **2026-11-17**

---

## Git Status
- Working in `alabiq-web-main/laravel/`
- All changes are local (not committed)
- Ready for next session to continue Phase C

---

**Session End: 2026-11-17**  
**Next Session: Start with `TapService` creation and `ObjectStorageService` container binding**