<?php

namespace App\Http\Controllers;

use App\Models\Merchant;
use Illuminate\Support\Facades\DB;

/**
 * Public marketing pages (Blade port of the archived React frontend).
 * Static copy lives in the views; only live catalogue data is queried here.
 */
class PageController extends Controller
{
    /**
     * Landing page — the same section order as the React App shell:
     * hero, popular near you, services, showcase, how-it-works, sponsored
     * reel, about, FAQ, footer.
     */
    public function home()
    {
        $restaurants = Merchant::query()
            ->where('vertical', 'food')
            ->where('is_active', true)
            ->where('status', 'active')
            ->orderByDesc('is_featured')
            ->orderBy('name')
            ->with('hours')
            ->take(12)
            ->get()
            ->map(fn (Merchant $m) => $this->presentMerchant($m));

        $logoPartners = Merchant::query()
            ->where('is_active', true)
            ->where('status', 'active')
            ->whereNotNull('logo_url')
            ->orderByDesc('is_featured')
            ->pluck('name', 'logo_url');

        // Platform-wide marketing stats, mirroring useMarketingPartners.
        $deliveryFee = DB::table('app_settings')->where('key', 'food_delivery_fee')->value('value');
        $minOrder = DB::table('app_settings')->where('key', 'food_min_order')->value('value');

        return view('site.home', [
            'restaurants' => $restaurants,
            'logoPartners' => $logoPartners,
            'partnersCount' => $restaurants->count(),
            'deliveryFeeLabel' => $this->deliveryFeeLabel($deliveryFee),
            'minOrder' => is_numeric($minOrder) ? (float) $minOrder : null,
        ]);
    }

    public function services()
    {
        return view('site.services');
    }

    public function servicesFood()
    {
        return view('site.services-food');
    }

    public function servicesShop()
    {
        return view('site.services-shop');
    }

    public function servicesPickDrop()
    {
        return view('site.services-pick-drop');
    }

    public function support()
    {
        return view('site.support');
    }

    public function helpCenter()
    {
        return view('site.help-center');
    }

    public function privacyPolicy()
    {
        return view('site.legal.privacy');
    }

    public function termsOfService()
    {
        return view('site.legal.terms');
    }

    public function cookiePreferences()
    {
        return view('site.cookie-preferences');
    }

    public function accountDeletion()
    {
        return view('site.account-deletion');
    }

    /**
     * /demo/restaurant — sales demo of the scoped one-restaurant customer app.
     * DEMO-ONLY: every dish and price below is invented fixture data (the same
     * dishes the archived React demo used); the page performs no database
     * reads or writes, and checkout is disabled client-side.
     */
    public function demoRestaurant()
    {
        return view('site.demo-restaurant', [
            'restaurant' => [
                'name' => "Aling Maria's Kitchen",
                'cuisine' => 'Filipino',
                'badge' => 'Popular',
                'description' => 'Filipino favourites, delivered.',
                'address' => 'Al Olaya, Riyadh',
                'hours' => 'Daily 10:00–23:00',
                'rating' => 4.8,
                'deliveryTime' => '25–35 min',
                'deliveryFee' => 5.0,
                'minOrder' => 30.0,
            ],
            'menu' => [
                ['name' => 'Mains', 'items' => [
                    ['id' => 'demo-m1', 'name' => 'Chicken Adobo', 'description' => 'Slow-braised chicken in vinegar, soy, and bay leaves. Served with rice.', 'price' => 24.0],
                    ['id' => 'demo-m2', 'name' => 'Beef Shawarma Plate', 'description' => 'Marinated beef, saffron rice, garlic sauce, and fresh pickles.', 'price' => 32.0],
                    ['id' => 'demo-m3', 'name' => 'Mandi Half Kilo', 'description' => 'Fragrant spiced rice with tender half-kilo chicken and house sauce.', 'price' => 48.0],
                    ['id' => 'demo-m4', 'name' => 'Chicken Biryani', 'description' => 'Layered basmati, fried onions, and raita on the side.', 'price' => 28.0],
                    ['id' => 'demo-m5', 'name' => 'Mixed Grill', 'description' => 'Kebab, kofta, and tikka skewers with grilled vegetables.', 'price' => 65.0],
                    ['id' => 'demo-m6', 'name' => 'Grilled Salmon Bowl', 'description' => 'Charred salmon over greens, quinoa, and citrus dressing.', 'price' => 55.0],
                ]],
                ['name' => 'Sides', 'items' => [
                    ['id' => 'demo-s1', 'name' => 'Falafel Wrap', 'description' => 'Crisp falafel, tahini, and salad in a toasted wrap.', 'price' => 14.0],
                    ['id' => 'demo-s2', 'name' => 'Hummus & Bread', 'description' => 'Creamy hummus with warm pita, olive oil, and sumac.', 'price' => 12.0],
                ]],
                ['name' => 'Drinks', 'items' => [
                    ['id' => 'demo-d1', 'name' => 'Karak Chai', 'description' => 'Strong brewed chai with cardamom, served hot.', 'price' => 6.0],
                    ['id' => 'demo-d2', 'name' => 'Mango Shake', 'description' => 'Blended fresh mango with milk and a touch of honey.', 'price' => 12.0],
                    ['id' => 'demo-d3', 'name' => 'Soft Drink', 'description' => 'Chilled canned soda — cola, lemon, or orange.', 'price' => 5.0],
                ]],
            ],
        ]);
    }

    /**
     * Shape a merchant for the marketing listing cards — the same fields the
     * React MarketingListingCard consumed.
     */
    private function presentMerchant(Merchant $m): array
    {
        $now = now();
        $today = (int) $now->format('w'); // 0 (Sun) – 6 (Sat), matches weekday column
        $hoursToday = $m->hours->firstWhere('weekday', $today);
        $isOpen = false;
        $hoursLabel = null;

        if ($hoursToday) {
            $time = $now->format('H:i:s');
            $isOpen = $time >= $hoursToday->opens_at && $time <= $hoursToday->closes_at;
            $hoursLabel = substr($hoursToday->opens_at, 0, 5).'–'.substr($hoursToday->closes_at, 0, 5);
        }

        return [
            'id' => $m->id,
            'name' => $m->name,
            'logo' => $m->logo_url,
            'tagline' => $m->description,
            'badge' => $m->badge,
            'cuisine' => $m->cuisine_type,
            'isOpen' => $isOpen,
            'hoursLabel' => $hoursLabel,
            'url' => '/services/food',
        ];
    }

    /**
     * app_settings stores money settings as jsonb — numbers come back as
     * numeric strings via the pgsql driver.
     */
    private function deliveryFeeLabel($value): ?string
    {
        if (! is_numeric($value)) {
            return null;
        }
        $n = (float) $value;

        return 'SAR '.rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
    }
}
