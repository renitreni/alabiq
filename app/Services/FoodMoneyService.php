<?php

namespace App\Services;

use App\Models\Merchant;

class FoodMoneyService
{
    public function __construct(
        protected VatService $vat,
        protected float $minOrderSar = 30.00,
        protected float $deliveryFeeSar = 10.00,
        protected float $maxRadiusKm = 50.0,
        protected float $freeRadiusKm = 15.0,
        protected float $surchargePerKm = 0.25,
        protected float $driverShareRate = 0.90,
        protected array $margins = [
            'meal_package' => 5.00,
            'drink_dessert_addon' => 3.00,
        ]
    ) {}

    public function marginForItemType(string $itemType): float
    {
        return $this->margins[$itemType] ?? throw new \InvalidArgumentException("Unknown item_type \"{$itemType}\"");
    }

    public function markupPerUnit(float $unitPrice, ?float $netPrice, string $itemType): float
    {
        if ($netPrice !== null) {
            $markup = $this->vat->round2($unitPrice - $netPrice);
            return max(0, $markup);
        }
        return min($this->marginForItemType($itemType), $this->vat->round2($unitPrice));
    }

    public function surchargeFor(?float $distanceKm, ?float $maxRadiusKm = null): array
    {
        $maxRadius = $maxRadiusKm ?? $this->maxRadiusKm;
        $freeRadius = $this->freeRadiusKm;

        if ($distanceKm === null || $distanceKm <= $freeRadius) {
            return ['surcharge' => 0.0, 'exceedsMax' => false];
        }

        if ($distanceKm > $maxRadius) {
            return ['surcharge' => 0.0, 'exceedsMax' => true];
        }

        $extraKm = $distanceKm - $freeRadius;
        $surcharge = $this->vat->round2($extraKm * $this->surchargePerKm);

        return ['surcharge' => $surcharge, 'exceedsMax' => false];
    }

    public function driverShareOf(float $deliveryFee): array
    {
        $driverFee = $this->vat->round2($deliveryFee * $this->driverShareRate);
        return [
            'driverFee' => $driverFee,
            'driverFeeRate' => $this->driverShareRate,
        ];
    }

    public function priceOrder(array $items, ?float $distanceKm, ?float $maxRadiusKm = null): array
    {
        $lines = [];
        foreach ($items as $item) {
            $quantity = (int)$item['quantity'];
            $unitPrice = $this->vat->round2($item['unitPrice']);
            $marginPerItem = $this->markupPerUnit(
                $unitPrice,
                $item['netPrice'] ?? null,
                $item['itemType']
            );

            $lines[] = [
                'menuItemId' => $item['menuItemId'],
                'name' => $item['name'],
                'size' => $item['size'] ?? null,
                'sizeLabel' => $item['sizeLabel'] ?? null,
                'unitPrice' => $unitPrice,
                'quantity' => $quantity,
                'lineTotal' => $this->vat->round2($unitPrice * $quantity),
                'marginPerItem' => $marginPerItem,
                'marginTotal' => $this->vat->round2($marginPerItem * $quantity),
                'itemType' => $item['itemType'],
            ];
        }

        $subtotal = $this->vat->round2(array_reduce($lines, fn($sum, $l) => $sum + $l['lineTotal'], 0));
        $marginTotal = $this->vat->round2(array_reduce($lines, fn($sum, $l) => $sum + $l['marginTotal'], 0));

        if ($subtotal < $this->minOrderSar) {
            return [
                'ok' => false,
                'failureReason' => 'min_order',
                'subtotal' => $subtotal,
                'minOrder' => $this->minOrderSar,
                'shortfall' => $this->vat->round2($this->minOrderSar - $subtotal),
            ];
        }

        $surchargeResult = $this->surchargeFor($distanceKm, $maxRadiusKm);
        if ($surchargeResult['exceedsMax']) {
            return [
                'ok' => false,
                'failureReason' => 'outside_radius',
                'distanceKm' => $this->vat->round2($distanceKm ?? 0),
                'maxRadiusKm' => $maxRadiusKm ?? $this->maxRadiusKm,
                'radiusKm' => $maxRadiusKm ?? $this->maxRadiusKm,
            ];
        }

        $baseDeliveryFee = $this->vat->round2($this->deliveryFeeSar);
        $deliverySurcharge = $surchargeResult['surcharge'];
        $deliveryFee = $this->vat->round2($baseDeliveryFee + $deliverySurcharge);

        $vat = $this->vat->vatFor($subtotal);
        $total = $this->vat->round2($subtotal + $deliveryFee + $vat['vatAmount']);

        $driverShare = $this->driverShareOf($deliveryFee);

        return [
            'ok' => true,
            'subtotal' => $subtotal,
            'marginTotal' => $marginTotal,
            'baseDeliveryFee' => $baseDeliveryFee,
            'deliverySurcharge' => $deliverySurcharge,
            'deliveryFee' => $deliveryFee,
            'driverFee' => $driverShare['driverFee'],
            'driverFeeRate' => $driverShare['driverFeeRate'],
            'vatRate' => $vat['vatRate'],
            'vatAmount' => $vat['vatAmount'],
            'total' => $total,
            'lines' => $lines,
        ];
    }

    public function creditAfterCharge(Merchant $merchant, float $marginTotal): array
    {
        $limit = (float)($merchant->credit_limit ?? 500.00);
        $before = $this->vat->round2((float)($merchant->credit_used ?? 0));
        $after = $this->vat->round2($before + $marginTotal);
        $alertAt = $this->vat->round2($limit * 0.80);

        return [
            'limit' => $limit,
            'before' => $before,
            'after' => $after,
            'alertAt' => $alertAt,
            'canAccept' => $before < $limit,
            'crossesAlert' => $before < $alertAt && $after >= $alertAt,
            'exhausted' => $after >= $limit,
        ];
    }

    public function getVatService(): VatService
    {
        return $this->vat;
    }
}