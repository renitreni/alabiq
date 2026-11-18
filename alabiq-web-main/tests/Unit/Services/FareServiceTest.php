<?php

namespace Tests\Unit\Services;

use App\Services\FareService;
use Tests\UnitTestCase;

class FareServiceTest extends UnitTestCase
{
    protected FareService $fare;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fare = new FareService;
    }

    public function test_calculate_flat_fare_no_distance(): void
    {
        $result = $this->fare->calculate(24.7136, 46.6753, 24.7136, 46.6753);

        $this->assertEquals(0, $result['distance_km']);
        $this->assertEquals(5, $result['duration_min']); // minimum 5 min
        // Base: 5 + 0*1.5 + 5*0.5 = 7.5 -> minimum 15
        $this->assertEquals(15.00, $result['fare_amount']);
        $this->assertEquals(1.50, $result['platform_fee']); // 10% of 15
        $this->assertEquals(13.50, $result['driver_fee']);
        $this->assertEquals(2.48, $result['vat_amount']); // 15% of (15+1.5) = 2.475 -> 2.48
        $this->assertEquals(18.98, $result['total_amount']); // 15 + 1.5 + 2.48
    }

    public function test_calculate_with_distance(): void
    {
        // ~20 km trip
        $result = $this->fare->calculate(24.7136, 46.6753, 24.9136, 46.8753);

        $this->assertGreaterThan(0, $result['distance_km']);
        $this->assertGreaterThanOrEqual(5, $result['duration_min']);
        $this->assertGreaterThanOrEqual(15.00, $result['fare_amount']);
        $this->assertEquals(round($result['fare_amount'] * 0.10, 2), $result['platform_fee']);
        $this->assertEquals(round($result['fare_amount'] - $result['platform_fee'], 2), $result['driver_fee']);
        $vatBase = $result['fare_amount'] + $result['platform_fee'];
        $this->assertEquals(round($vatBase * 0.15, 2), $result['vat_amount']);
        $this->assertEquals(round($result['fare_amount'] + $result['platform_fee'] + $result['vat_amount'], 2), $result['total_amount']);
    }

    public function test_calculate_minimum_fare_applied(): void
    {
        // Very short distance should hit minimum fare
        $result = $this->fare->calculate(24.7136, 46.6753, 24.7137, 46.6754);

        $this->assertEquals(15.00, $result['fare_amount']);
    }

    public function test_calculate_night_surcharge(): void
    {
        // 10 PM
        $result = $this->fare->calculate(
            24.7136, 46.6753,
            24.8136, 46.7753,
            'pick_drop',
            '2026-11-18 22:30:00'
        );

        $this->assertGreaterThan(15.00, $result['fare_amount']); // Should have night multiplier
    }

    public function test_calculate_no_night_surcharge_daytime(): void
    {
        // 2 PM
        $result = $this->fare->calculate(
            24.7136, 46.6753,
            24.8136, 46.7753,
            'pick_drop',
            '2026-11-18 14:30:00'
        );

        $dayResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', null);
        $this->assertEquals($dayResult['fare_amount'], $result['fare_amount']);
    }

    public function test_calculate_distance_haversine(): void
    {
        // Riyadh to Jeddah ~850 km - test through calculate() which uses Haversine internally
        $result = $this->fare->calculate(24.7136, 46.6753, 21.4858, 39.1925);
        $this->assertEqualsWithDelta(850, $result['distance_km'], 50);
    }

    public function test_calculate_distance_zero(): void
    {
        $result = $this->fare->calculate(24.7136, 46.6753, 24.7136, 46.6753);
        $this->assertEquals(0, $result['distance_km']);
    }

    public function test_night_surcharge_applied_at_10pm(): void
    {
        $dayResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 14:30:00');
        $nightResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 22:30:00');

        $this->assertGreaterThan($dayResult['fare_amount'], $nightResult['fare_amount']);
    }

    public function test_night_surcharge_applied_at_5am(): void
    {
        $dayResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 14:30:00');
        $nightResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 05:30:00');

        $this->assertGreaterThan($dayResult['fare_amount'], $nightResult['fare_amount']);
    }

    public function test_no_night_surcharge_at_6am(): void
    {
        $dayResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 14:30:00');
        $morningResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 06:30:00');

        $this->assertEquals($dayResult['fare_amount'], $morningResult['fare_amount']);
    }

    public function test_no_night_surcharge_at_9pm(): void
    {
        $dayResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 14:30:00');
        $eveningResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 21:30:00');

        $this->assertEquals($dayResult['fare_amount'], $eveningResult['fare_amount']);
    }

    public function test_no_night_surcharge_when_null(): void
    {
        $dayResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', '2026-11-18 14:30:00');
        $nullResult = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753, 'pick_drop', null);

        $this->assertEquals($dayResult['fare_amount'], $nullResult['fare_amount']);
    }

    public function test_calculate_platform_fee_10_percent(): void
    {
        $result = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753);
        $expectedFee = round($result['fare_amount'] * 0.10, 2);
        $this->assertEquals($expectedFee, $result['platform_fee']);
    }

    public function test_calculate_driver_fee_is_fare_minus_platform(): void
    {
        $result = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753);
        $expectedDriver = round($result['fare_amount'] - $result['platform_fee'], 2);
        $this->assertEquals($expectedDriver, $result['driver_fee']);
    }

    public function test_calculate_vat_on_fare_plus_platform_fee(): void
    {
        $result = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753);
        $vatBase = $result['fare_amount'] + $result['platform_fee'];
        $expectedVat = round($vatBase * 0.15, 2);
        $this->assertEquals($expectedVat, $result['vat_amount']);
    }

    public function test_calculate_total_includes_vat(): void
    {
        $result = $this->fare->calculate(24.7136, 46.6753, 24.8136, 46.7753);
        $expectedTotal = round($result['fare_amount'] + $result['platform_fee'] + $result['vat_amount'], 2);
        $this->assertEquals($expectedTotal, $result['total_amount']);
    }
}
