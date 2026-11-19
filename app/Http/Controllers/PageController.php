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
            $hoursLabel = substr($hoursToday->opens_at, 0, 5) . '–' . substr($hoursToday->closes_at, 0, 5);
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
        if (!is_numeric($value)) {
            return null;
        }
        $n = (float) $value;
        return 'SAR ' . rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
    }
}
