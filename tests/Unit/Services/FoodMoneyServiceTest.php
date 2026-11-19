<?php

namespace Tests\Unit\Services;

use App\Models\Merchant;
use App\Services\FoodMoneyService;
use App\Services\VatService;
use Tests\UnitTestCase;

class FoodMoneyServiceTest extends UnitTestCase
{
    protected FoodMoneyService $foodMoney;

    protected function setUp(): void
    {
        parent::setUp();
        $vat = new VatService(0.15);
        $this->foodMoney = new FoodMoneyService($vat);
    }

    public function test_margin_for_item_type_meal_package(): void
    {
        $this->assertEquals(5.00, $this->foodMoney->marginForItemType('meal_package'));
    }

    public function test_margin_for_item_type_drink_dessert_addon(): void
    {
        $this->assertEquals(3.00, $this->foodMoney->marginForItemType('drink_dessert_addon'));
    }

    public function test_margin_for_item_type_unknown_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown item_type "side_order"');
        $this->foodMoney->marginForItemType('side_order');
    }

    public function test_markup_per_unit_flat_margin_meal_package(): void
    {
        $markup = $this->foodMoney->markupPerUnit(65, null, 'meal_package');
        $this->assertEquals(5.00, $markup);
    }

    public function test_markup_per_unit_flat_margin_drink_dessert(): void
    {
        $markup = $this->foodMoney->markupPerUnit(10, null, 'drink_dessert_addon');
        $this->assertEquals(3.00, $markup);
    }

    public function test_markup_per_unit_clamp_to_unit_price_cheap_item(): void
    {
        $markup = $this->foodMoney->markupPerUnit(1.99, null, 'drink_dessert_addon');
        $this->assertEquals(1.99, $markup);
    }

    public function test_markup_per_unit_at_exact_margin_boundary(): void
    {
        $markup = $this->foodMoney->markupPerUnit(3.00, null, 'drink_dessert_addon');
        $this->assertEquals(3.00, $markup);
    }

    public function test_markup_per_unit_net_price_branch(): void
    {
        $markup = $this->foodMoney->markupPerUnit(1.99, 1.50, 'drink_dessert_addon');
        $this->assertEquals(0.49, $markup);
    }

    public function test_markup_per_unit_net_price_zero_keeps_full_price(): void
    {
        $markup = $this->foodMoney->markupPerUnit(1.99, 0, 'meal_package');
        $this->assertEquals(1.99, $markup);
    }

    public function test_markup_per_unit_net_price_above_list_yields_zero(): void
    {
        $markup = $this->foodMoney->markupPerUnit(10, 12, 'meal_package');
        $this->assertEquals(0, $markup);
    }

    public function test_surcharge_for_within_free_radius(): void
    {
        $result = $this->foodMoney->surchargeFor(10);
        $this->assertEquals(0.0, $result['surcharge']);
        $this->assertFalse($result['exceedsMax']);
    }

    public function test_surcharge_for_null_distance(): void
    {
        $result = $this->foodMoney->surchargeFor(null);
        $this->assertEquals(0.0, $result['surcharge']);
        $this->assertFalse($result['exceedsMax']);
    }

    public function test_surcharge_for_beyond_free_radius(): void
    {
        $result = $this->foodMoney->surchargeFor(20);
        $this->assertEquals(1.25, $result['surcharge']);
        $this->assertFalse($result['exceedsMax']);
    }

    public function test_surcharge_for_exceeds_max_radius(): void
    {
        $result = $this->foodMoney->surchargeFor(55);
        $this->assertEquals(0.0, $result['surcharge']);
        $this->assertTrue($result['exceedsMax']);
    }

    public function test_surcharge_for_custom_max_radius(): void
    {
        $result = $this->foodMoney->surchargeFor(20, 30);
        $this->assertEquals(1.25, $result['surcharge']);
        $this->assertFalse($result['exceedsMax']);
    }

    public function test_driver_share_of_delivery_fee(): void
    {
        $result = $this->foodMoney->driverShareOf(10);
        $this->assertEquals(9.00, $result['driverFee']);
        $this->assertEquals(0.90, $result['driverFeeRate']);
    }

    public function test_driver_share_of_with_surcharge(): void
    {
        $result = $this->foodMoney->driverShareOf(11.25);
        $this->assertEquals(10.13, $result['driverFee']);
    }

    public function test_price_order_single_meal_within_radius(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 65, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, 5);

        $this->assertTrue($result['ok']);
        $this->assertEquals(65, $result['subtotal']);
        $this->assertEquals(5.00, $result['marginTotal']);
        $this->assertEquals(10, $result['baseDeliveryFee']);
        $this->assertEquals(0, $result['deliverySurcharge']);
        $this->assertEquals(10, $result['deliveryFee']);
        $this->assertEquals(9, $result['driverFee']);
        $this->assertEquals(0.90, $result['driverFeeRate']);
        $this->assertEquals(0.15, $result['vatRate']);
        $this->assertEquals(9.75, $result['vatAmount']);
        $this->assertEquals(84.75, $result['total']);
        $this->assertCount(1, $result['lines']);
    }

    public function test_price_order_vat_on_subtotal_only_delivery_outside_base(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 100, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, 5);

        $this->assertEquals(15.00, $result['vatAmount']);
        $this->assertEquals(125.00, $result['total']);
    }

    public function test_price_order_min_order_fails(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 10, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, 5);

        $this->assertFalse($result['ok']);
        $this->assertEquals('min_order', $result['failureReason']);
        $this->assertEquals(10, $result['subtotal']);
        $this->assertEquals(30, $result['minOrder']);
        $this->assertEquals(20, $result['shortfall']);
    }

    public function test_price_order_outside_radius_fails(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 65, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, 55);

        $this->assertFalse($result['ok']);
        $this->assertEquals('outside_radius', $result['failureReason']);
        $this->assertEquals(55, $result['distanceKm']);
        $this->assertEquals(50, $result['maxRadiusKm']);
    }

    public function test_price_order_max_radius_inclusive(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 65, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, 50);

        $this->assertTrue($result['ok']);
    }

    public function test_price_order_unknown_distance_charges_flat_fee(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 65, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, null);

        $this->assertTrue($result['ok']);
        $this->assertEquals(0, $result['deliverySurcharge']);
        $this->assertEquals(10, $result['deliveryFee']);
    }

    public function test_price_order_min_order_before_radius_check(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 10, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, 500);

        $this->assertEquals('min_order', $result['failureReason']);
    }

    public function test_price_order_cheap_items_no_merchant_debt(): void
    {
        $items = [
            ['menuItemId' => 'w', 'name' => 'BOTTLED WATER', 'unitPrice' => 1.99, 'quantity' => 20, 'itemType' => 'drink_dessert_addon'],
        ];
        $result = $this->foodMoney->priceOrder($items, null);

        $this->assertTrue($result['ok']);
        $this->assertEquals(39.80, $result['subtotal']);
        $this->assertEquals(39.80, $result['marginTotal']);
        $this->assertEquals(0, $result['subtotal'] - $result['marginTotal']);
    }

    public function test_price_order_delivery_fee_split_driver_90_platform_10(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 65, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, null);

        $this->assertEquals(10, $result['deliveryFee']);
        $this->assertEquals(9, $result['driverFee']);
        $this->assertEquals(0.90, $result['driverFeeRate']);
        $this->assertEquals(1, $this->foodMoney->getVatService()->round2($result['deliveryFee'] - $result['driverFee']));
    }

    public function test_price_order_distance_surcharge_split_with_driver(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 65, 'quantity' => 1, 'itemType' => 'meal_package'],
        ];
        $result = $this->foodMoney->priceOrder($items, 20);

        $this->assertEquals(11.25, $result['deliveryFee']);
        $this->assertEquals(10.13, $result['driverFee']);
    }

    public function test_price_order_cash_rider_owes_platform_share(): void
    {
        $items = [
            ['menuItemId' => 'mi-1', 'name' => 'Meal', 'unitPrice' => 100, 'quantity' => 1, 'itemType' => 'meal_package', 'netPrice' => 90],
        ];
        $result = $this->foodMoney->priceOrder($items, null);

        $this->assertEquals(10, $result['marginTotal']);
        $this->assertEquals(15, $result['vatAmount']);
        $this->assertEquals(9, $result['driverFee']);

        $vat = $this->foodMoney->getVatService();
        $owed = $vat->round2(
            $result['marginTotal'] + $result['vatAmount'] + $vat->round2($result['deliveryFee'] - $result['driverFee'])
        );
        $this->assertEquals(26, $owed);

        $riderHolds = $vat->round2($result['total'] - $owed - ($result['subtotal'] - $result['marginTotal']));
        $this->assertEquals($result['driverFee'], $riderHolds);
    }

    public function test_credit_after_charge_at_limit_cannot_accept(): void
    {
        $merchant = new Merchant;
        $merchant->credit_limit = 300;
        $merchant->credit_used = 300;

        $state = $this->foodMoney->creditAfterCharge($merchant, 5);

        $this->assertFalse($state['canAccept']);
        $this->assertTrue($state['exhausted']);
    }

    public function test_credit_after_charge_80_percent_alert_fires_once(): void
    {
        $merchant = new Merchant;
        $merchant->credit_limit = 300;
        $merchant->credit_used = 238;

        $crossing = $this->foodMoney->creditAfterCharge($merchant, 5);
        $this->assertEquals(240, $crossing['alertAt']);
        $this->assertTrue($crossing['crossesAlert']);

        $merchant2 = new Merchant;
        $merchant2->credit_limit = 300;
        $merchant2->credit_used = 243;
        $alreadyOver = $this->foodMoney->creditAfterCharge($merchant2, 5);
        $this->assertFalse($alreadyOver['crossesAlert']);
    }

    public function test_credit_after_charge_fallback_to_platform_limit(): void
    {
        $merchant = new Merchant;
        $merchant->credit_used = 0;

        $state = $this->foodMoney->creditAfterCharge($merchant, 5);

        $this->assertEquals(500.00, $state['limit']);
        $this->assertTrue($state['canAccept']);
    }
}
