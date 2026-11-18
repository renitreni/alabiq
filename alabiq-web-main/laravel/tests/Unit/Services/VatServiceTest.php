<?php

namespace Tests\Unit\Services;

use App\Services\VatService;
use Tests\UnitTestCase;

class VatServiceTest extends UnitTestCase
{
    protected VatService $vat;

    protected function setUp(): void
    {
        parent::setUp();
        $this->vat = new VatService(0.15);
    }

    public function test_vat_for_returns_rate_and_amount(): void
    {
        $result = $this->vat->vatFor(50);
        $this->assertEquals(0.15, $result['vatRate']);
        $this->assertEquals(7.5, $result['vatAmount']);
    }

    public function test_vat_for_103_75_half_up_rounding(): void
    {
        // 103.75 * 0.15 = 15.5625 -> half-up = 15.56
        $result = $this->vat->vatFor(103.75);
        $this->assertEquals(0.15, $result['vatRate']);
        $this->assertEquals(15.56, $result['vatAmount']);
    }

    public function test_vat_for_zero_base_returns_zero(): void
    {
        $result = $this->vat->vatFor(0);
        $this->assertEquals(0, $result['vatAmount']);
    }

    public function test_vat_for_negative_base_returns_zero(): void
    {
        $result = $this->vat->vatFor(-50);
        $this->assertEquals(0, $result['vatAmount']);
    }

    public function test_vat_for_nan_returns_zero(): void
    {
        $result = $this->vat->vatFor(NAN);
        $this->assertEquals(0, $result['vatAmount']);
    }

    public function test_vat_for_null_returns_zero(): void
    {
        $result = $this->vat->vatFor(null);
        $this->assertEquals(0, $result['vatAmount']);
    }

    public function test_vat_for_string_returns_zero(): void
    {
        $result = $this->vat->vatFor('abc');
        $this->assertEquals(0, $result['vatAmount']);
    }

    public function test_vat_label_renders_15_percent(): void
    {
        $this->assertEquals('VAT (15%)', $this->vat->vatLabel());
    }

    public function test_vat_label_renders_custom_rate(): void
    {
        $this->assertEquals('VAT (5%)', $this->vat->vatLabel(0.05));
    }

    public function test_round2_half_up_at_vat_amounts(): void
    {
        // 50.50 * 0.15 = 7.575 -> half-up = 7.58 (not 7.57 like legacy epsilon round)
        $this->assertEquals(7.58, $this->vat->round2(50.5 * 0.15));
        $this->assertEquals(4.52, $this->vat->round2(30.1 * 0.15));
    }

    public function test_round2_refund_rounds_away_from_zero(): void
    {
        // Math.round breaks ties toward +Infinity, so -0.005 would become -0
        // Our round2 must round away from zero so a half-halala credit is not lost
        $this->assertEquals(-0.01, $this->vat->round2(-0.005));
        $this->assertEquals(-7.58, $this->vat->round2(-7.575));
    }

    public function test_round2_negative_zero_normalized_to_positive(): void
    {
        $result = $this->vat->round2(-0.001);
        $this->assertTrue($result === 0.0 || $result === 0);
        $this->assertEquals('0.00', number_format($result, 2, '.', ''));
    }

    public function test_round2_idempotent(): void
    {
        $values = [7.575, 0.005, 103.75, 1.005, -2.675, 0];
        foreach ($values as $n) {
            $this->assertEquals($this->vat->round2($n), $this->vat->round2($this->vat->round2($n)), "round2 twice on {$n}");
        }
    }

    public function test_round2_keeps_whole_and_2dp_amounts(): void
    {
        $this->assertEquals(0, $this->vat->round2(0));
        $this->assertEquals(100, $this->vat->round2(100));
        $this->assertEquals(1.99, $this->vat->round2(1.99));
        $this->assertEquals(12.34, $this->vat->round2('12.34'));
    }

    public function test_round2_non_finite_returns_zero(): void
    {
        foreach ([NAN, INF, -INF, null, 'abc', [], new \stdClass] as $bad) {
            $this->assertEquals(0, $this->vat->round2($bad), 'round2('.(is_scalar($bad) ? (string) $bad : gettype($bad)).')');
        }
    }
}
