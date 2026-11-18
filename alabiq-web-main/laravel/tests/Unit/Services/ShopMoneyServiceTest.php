<?php

namespace Tests\Unit\Services;

use App\Models\Merchant;
use App\Services\ShopMoneyService;
use App\Services\VatService;
use Tests\UnitTestCase;

class ShopMoneyServiceTest extends UnitTestCase
{
    protected ShopMoneyService $shopMoney;

    protected function setUp(): void
    {
        parent::setUp();
        $vat = new VatService(0.15);
        $this->shopMoney = new ShopMoneyService($vat);
    }

    public function test_markup_per_unit_flat_default_margin(): void
    {
        $markup = $this->shopMoney->markupPerUnit(50, null);
        $this->assertEquals(3.00, $markup);
    }

    public function test_markup_per_unit_clamp_to_unit_price(): void
    {
        $markup = $this->shopMoney->markupPerUnit(2.00, null);
        $this->assertEquals(2.00, $markup);
    }

    public function test_markup_per_unit_net_price_branch(): void
    {
        $markup = $this->shopMoney->markupPerUnit(50, 40);
        $this->assertEquals(10.00, $markup);
    }

    public function test_markup_per_unit_net_price_zero_keeps_full(): void
    {
        $markup = $this->shopMoney->markupPerUnit(50, 0);
        $this->assertEquals(50.00, $markup);
    }

    public function test_markup_per_unit_net_above_list_yields_zero(): void
    {
        $markup = $this->shopMoney->markupPerUnit(10, 12);
        $this->assertEquals(0, $markup);
    }

    public function test_resolve_unit_pricing_variant_overrides_product(): void
    {
        $product = ['price' => 50, 'net_price' => 40];
        $variant = ['price' => 60, 'net_price' => 45];

        $result = $this->shopMoney->resolveUnitPricing($product, $variant);

        $this->assertEquals(60, $result['unitPrice']);
        $this->assertEquals(45, $result['netPrice']);
    }

    public function test_resolve_unit_pricing_variant_null_inherits_product(): void
    {
        $product = ['price' => 50, 'net_price' => 40];
        $variant = ['price' => null, 'net_price' => null];

        $result = $this->shopMoney->resolveUnitPricing($product, $variant);

        $this->assertEquals(50, $result['unitPrice']);
        $this->assertEquals(40, $result['netPrice']);
    }

    public function test_resolve_unit_pricing_variant_partial_override(): void
    {
        $product = ['price' => 50, 'net_price' => 40];
        $variant = ['price' => 60];

        $result = $this->shopMoney->resolveUnitPricing($product, $variant);

        $this->assertEquals(60, $result['unitPrice']);
        $this->assertEquals(40, $result['netPrice']);
    }

    public function test_availability_band_not_tracked_returns_in_stock(): void
    {
        $this->assertEquals('in_stock', $this->shopMoney->availabilityBand(['stock_quantity' => 0], false));
    }

    public function test_availability_band_out_of_stock(): void
    {
        $this->assertEquals('out', $this->shopMoney->availabilityBand(['stock_quantity' => 0], true));
    }

    public function test_availability_band_low_stock(): void
    {
        $row = ['stock_quantity' => 3, 'low_stock_threshold' => 5];
        $this->assertEquals('low', $this->shopMoney->availabilityBand($row, true));
    }

    public function test_availability_band_in_stock_above_threshold(): void
    {
        $row = ['stock_quantity' => 10, 'low_stock_threshold' => 5];
        $this->assertEquals('in_stock', $this->shopMoney->availabilityBand($row, true));
    }

    public function test_availability_band_fallback_threshold(): void
    {
        $row = ['stock_quantity' => 3];
        $this->assertEquals('low', $this->shopMoney->availabilityBand($row, true));
    }

    public function test_available_units_untracked_returns_null(): void
    {
        $this->assertNull($this->shopMoney->availableUnits(['track_stock' => false], null));
    }

    public function test_available_units_from_variant(): void
    {
        $result = $this->shopMoney->availableUnits(['track_stock' => true], ['stock_quantity' => 25]);
        $this->assertEquals(25, $result);
    }

    public function test_available_units_from_product(): void
    {
        $result = $this->shopMoney->availableUnits(['track_stock' => true, 'stock_quantity' => 15], null);
        $this->assertEquals(15, $result);
    }

    public function test_available_units_zero_when_missing(): void
    {
        $result = $this->shopMoney->availableUnits(['track_stock' => true], null);
        $this->assertEquals(0, $result);
    }

    public function test_surcharge_for_within_free_radius(): void
    {
        $result = $this->shopMoney->surchargeFor(10);
        $this->assertEquals(0.0, $result['surcharge']);
        $this->assertFalse($result['exceedsMax']);
    }

    public function test_surcharge_for_beyond_free_radius(): void
    {
        $result = $this->shopMoney->surchargeFor(20);
        $this->assertEquals(1.25, $result['surcharge']);
        $this->assertFalse($result['exceedsMax']);
    }

    public function test_surcharge_for_exceeds_max_radius(): void
    {
        $result = $this->shopMoney->surchargeFor(55);
        $this->assertEquals(0.0, $result['surcharge']);
        $this->assertTrue($result['exceedsMax']);
    }

    public function test_driver_share_of_delivery_fee(): void
    {
        $result = $this->shopMoney->driverShareOf(15);
        $this->assertEquals(13.50, $result['driverFee']);
        $this->assertEquals(0.90, $result['driverFeeRate']);
    }

    public function test_price_shop_order_single_product(): void
    {
        $items = [
            ['productId' => 'p-1', 'variantId' => null, 'name' => 'Product', 'unitPrice' => 100, 'quantity' => 1, 'netPrice' => 90],
        ];
        $result = $this->shopMoney->priceShopOrder($items, 5);

        $this->assertTrue($result['ok']);
        $this->assertEquals(100, $result['subtotal']);
        $this->assertEquals(10.00, $result['marginTotal']);
        $this->assertEquals(15, $result['baseDeliveryFee']);
        $this->assertEquals(0, $result['deliverySurcharge']);
        $this->assertEquals(15, $result['deliveryFee']);
        $this->assertEquals(13.50, $result['driverFee']);
        $this->assertEquals(0.90, $result['driverFeeRate']);
        $this->assertEquals(0.15, $result['vatRate']);
        $this->assertEquals(15.00, $result['vatAmount']);
        $this->assertEquals(130.00, $result['total']);
        $this->assertCount(1, $result['lines']);
    }

    public function test_price_shop_order_vat_on_subtotal_only(): void
    {
        $items = [
            ['productId' => 'p-1', 'name' => 'Product', 'unitPrice' => 100, 'quantity' => 1, 'netPrice' => 90],
        ];
        $result = $this->shopMoney->priceShopOrder($items, 5);

        $this->assertEquals(15.00, $result['vatAmount']);
        $this->assertEquals(130.00, $result['total']);
    }

    public function test_price_shop_order_min_order_fails(): void
    {
        $items = [
            ['productId' => 'p-1', 'name' => 'Product', 'unitPrice' => 20, 'quantity' => 1, 'netPrice' => 15],
        ];
        $result = $this->shopMoney->priceShopOrder($items, 5);

        $this->assertFalse($result['ok']);
        $this->assertEquals('min_order', $result['failureReason']);
        $this->assertEquals(20, $result['subtotal']);
        $this->assertEquals(50, $result['minOrder']);
        $this->assertEquals(30, $result['shortfall']);
    }

    public function test_price_shop_order_outside_radius_fails(): void
    {
        $items = [
            ['productId' => 'p-1', 'name' => 'Product', 'unitPrice' => 100, 'quantity' => 1, 'netPrice' => 90],
        ];
        $result = $this->shopMoney->priceShopOrder($items, 55);

        $this->assertFalse($result['ok']);
        $this->assertEquals('outside_radius', $result['failureReason']);
        $this->assertEquals(55, $result['distanceKm']);
        $this->assertEquals(50, $result['maxRadiusKm']);
    }

    public function test_price_shop_order_max_radius_inclusive(): void
    {
        $items = [
            ['productId' => 'p-1', 'name' => 'Product', 'unitPrice' => 100, 'quantity' => 1, 'netPrice' => 90],
        ];
        $result = $this->shopMoney->priceShopOrder($items, 50);

        $this->assertTrue($result['ok']);
    }

    public function test_price_shop_order_unknown_distance_flat_fee(): void
    {
        $items = [
            ['productId' => 'p-1', 'name' => 'Product', 'unitPrice' => 100, 'quantity' => 1, 'netPrice' => 90],
        ];
        $result = $this->shopMoney->priceShopOrder($items, null);

        $this->assertTrue($result['ok']);
        $this->assertEquals(0, $result['deliverySurcharge']);
        $this->assertEquals(15, $result['deliveryFee']);
    }

    public function test_price_shop_order_delivery_fee_split(): void
    {
        $items = [
            ['productId' => 'p-1', 'name' => 'Product', 'unitPrice' => 100, 'quantity' => 1, 'netPrice' => 90],
        ];
        $result = $this->shopMoney->priceShopOrder($items, null);

        $this->assertEquals(15, $result['deliveryFee']);
        $this->assertEquals(13.50, $result['driverFee']);
        $this->assertEquals(0.90, $result['driverFeeRate']);
        $this->assertEquals(1.50, $this->shopMoney->getVatService()->round2($result['deliveryFee'] - $result['driverFee']));
    }

    public function test_credit_after_charge_at_limit_cannot_accept(): void
    {
        $merchant = new Merchant;
        $merchant->credit_limit = 300;
        $merchant->credit_used = 300;

        $state = $this->shopMoney->creditAfterCharge($merchant, 5);

        $this->assertFalse($state['canAccept']);
        $this->assertTrue($state['exhausted']);
    }

    public function test_credit_after_charge_80_percent_alert_fires_once(): void
    {
        $merchant = new Merchant;
        $merchant->credit_limit = 300;
        $merchant->credit_used = 238;

        $crossing = $this->shopMoney->creditAfterCharge($merchant, 5);
        $this->assertEquals(240, $crossing['alertAt']);
        $this->assertTrue($crossing['crossesAlert']);

        $merchant2 = new Merchant;
        $merchant2->credit_limit = 300;
        $merchant2->credit_used = 243;
        $alreadyOver = $this->shopMoney->creditAfterCharge($merchant2, 5);
        $this->assertFalse($alreadyOver['crossesAlert']);
    }

    public function test_credit_after_charge_fallback_to_platform_limit(): void
    {
        $merchant = new Merchant;
        $merchant->credit_used = 0;

        $state = $this->shopMoney->creditAfterCharge($merchant, 5);

        $this->assertEquals(500.00, $state['limit']);
        $this->assertTrue($state['canAccept']);
    }
}
