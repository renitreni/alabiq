<?php

namespace App\Services;

class VatService
{
    public function __construct(
        protected float $rate = 0.15
    ) {}

    /**
     * Calculate VAT on a pre-tax base.
     * Returns ['vatRate' => float, 'vatAmount' => float]
     */
    public function vatFor(float|int|string|null $base): array
    {
        $amount = is_numeric($base) ? (float)$base : 0;
        if ($amount <= 0) {
            return ['vatRate' => $this->rate, 'vatAmount' => 0.0];
        }

        return [
            'vatRate' => $this->rate,
            'vatAmount' => $this->round2($amount * $this->rate),
        ];
    }

    /**
     * Human label for receipts: "VAT (15%)"
     */
    public function vatLabel(?float $rate = null): string
    {
        $rate = $rate ?? $this->rate;
        $pct = $this->round2($rate * 100);
        return "VAT ({$pct}%)";
    }

    /**
     * Round to 2 decimal places using half-up rounding.
     * Matches the Node.js round2 behavior exactly.
     */
    public function round2(mixed $n): float
    {
        // Handle arrays, objects, and other non-scalar types
        if (!is_scalar($n)) {
            return 0.0;
        }
        $v = is_numeric($n) ? (float)$n : 0;
        if (!is_finite($v)) return 0.0;

        $sign = $v >= 0 ? 1 : -1;
        $abs = abs($v);
        $rounded = $sign * round($abs * 100 + 1e-9) / 100;

        // Normalize -0 to 0
        return $rounded + 0.0;
    }
}