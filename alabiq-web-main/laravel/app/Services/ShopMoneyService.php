<?php

namespace App\Services;

use App\Models\Merchant;

class ShopMoneyService
{
    public function __construct(
        protected VatService $vat,
        protected float $minOrderSar = 50.00,
        protected float $deliveryFeeSar = 15.00,
        protected float $maxRadiusKm = 50.0,
        protected float $freeRadiusKm = 15.0,
        protected float $surchargePerKm = 0.25,
        protected float $driverShareRate = 0.90,
        protected float $defaultMargin = 3.00,
        protected float $lowStockThreshold = 5
    ) {}

    public function markupPerUnit(float $unitPrice, ?float $netPrice): float
    {
        if ($netPrice !== null) {
            $markup = $this->vat->round2($unitPrice - $netPrice);
            return max(0, $markup);
        }
        return min($this->defaultMargin, $this->vat->round2($unitPrice));
    }

    public function resolveUnitPricing(array $product, ?array $variant): array
    {
        $unitPrice = $this->vat->round2(
            ($variant && isset($variant['price']) && $variant['price'] !== null)
                ? (float)$variant['price']
                : (float)$product['price']
        );

        $netPrice = null;
        if ($variant && isset($variant['net_price']) && $variant['net_price'] !== null) {
            $netPrice = (float)$variant['net_price'];
        } elseif (isset($product['net_price']) && $product['net_price'] !== null) {
            $netPrice = (float)$product['net_price'];
        }

        return ['unitPrice' => $unitPrice, 'netPrice' => $netPrice];
    }

    public function availabilityBand(?array $row, bool $trackStock): string
    {
        if (!$trackStock) return 'in_stock';
        $qty = $row ? (int)($row['stock_quantity'] ?? 0) : 0;
        if ($qty <= 0) return 'out';

        $threshold = $row && isset($row['low_stock_threshold']) && is_numeric($row['low_stock_threshold'])
            ? (int)$row['low_stock_threshold']
            : $this->lowStockThreshold;

        return $qty <= $threshold ? 'low' : 'in_stock';
    }

    public function availableUnits(array $product, ?array $variant): ?int
    {
        if (!($product['track_stock'] ?? true)) return null;
        $source = $variant ?? $product;
        return (int)($source['stock_quantity'] ?? 0) ?: 0;
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
        return ['driverFee' => $driverFee, 'driverFeeRate' => $this->driverShareRate];
    }

    public function priceShopOrder(array $items, ?float $distanceKm, ?float $maxRadiusKm = null): array
    {
        $lines = [];
        foreach ($items as $item) {
            $quantity = (int)$item['quantity'];
            $unitPrice = $this->vat->round2($item['unitPrice']);
            $marginPerItem = $this->markupPerUnit($unitPrice, $item['netPrice'] ?? null);

            $lines[] = [
                'productId' => $item['productId'],
                'variantId' => $item['variantId'] ?? null,
                'name' => $item['name'],
                'variantLabel' => $item['variantLabel'] ?? null,
                'sku' => $item['sku'] ?? null,
                'unitPrice' => $unitPrice,
                'quantity' => $quantity,
                'lineTotal' => $this->vat->round2($unitPrice * $quantity),
                'marginPerItem' => $marginPerItem,
                'marginTotal' => $this->vat->round2($marginPerItem * $quantity),
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