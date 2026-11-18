<?php

namespace App\Services;

use Illuminate\Support\Facades\Config;

class FareService
{
    /**
     * Calculate fare for a trip.
     */
    public function calculate(
        float $pickupLat,
        float $pickupLng,
        float $dropoffLat,
        float $dropoffLng,
        string $serviceType = 'pick_drop',
        ?string $scheduledAt = null
    ): array {
        // Calculate distance using Haversine formula
        $distanceKm = $this->calculateDistance($pickupLat, $pickupLng, $dropoffLat, $dropoffLng);

        // Estimate duration (rough: 30 km/h average in city)
        $durationMin = max(5, ceil($distanceKm / 30 * 60));

        // Base fare configuration
        $config = Config::get('alabiq.fare', [
            'base_fare' => 5.00,
            'per_km' => 1.50,
            'per_minute' => 0.50,
            'minimum_fare' => 15.00,
            'airport_surcharge' => 20.00,
            'night_surcharge_multiplier' => 1.25,
            'peak_surcharge_multiplier' => 1.25,
        ]);

        $baseFare = $config['base_fare'];
        $perKm = $config['per_km'];
        $perMinute = $config['per_minute'];
        $minimumFare = $config['minimum_fare'];

        // Calculate fare
        $fareAmount = $baseFare + ($distanceKm * $perKm) + ($durationMin * $perMinute);
        $fareAmount = max($fareAmount, $minimumFare);

        // Apply surcharges
        $isNight = $this->isNightTime($scheduledAt);
        if ($isNight) {
            $fareAmount *= $config['night_surcharge_multiplier'];
        }

        // Airport surcharge (simplified - would check if pickup/dropoff near airport)
        // $isAirport = $this->isAirport($pickupLat, $pickupLng, $dropoffLat, $dropoffLng);
        // if ($isAirport) {
        //     $fareAmount += $config['airport_surcharge'];
        // }

        // Platform fee (10% for pick&drop)
        $platformFeePercent = 0.10;
        $platformFee = round($fareAmount * $platformFeePercent, 2);

        // Driver fee (fare - platform fee)
        $driverFee = round($fareAmount - $platformFee, 2);

        // VAT (15%)
        $vatRate = Config::get('alabiq.vat.rate', 0.15);
        $vatAmount = round(($fareAmount + $platformFee) * $vatRate, 2);

        // Total amount
        $totalAmount = round($fareAmount + $platformFee + $vatAmount, 2);

        return [
            'distance_km' => round($distanceKm, 2),
            'duration_min' => $durationMin,
            'fare_amount' => round($fareAmount, 2),
            'platform_fee' => $platformFee,
            'driver_fee' => $driverFee,
            'vat_amount' => $vatAmount,
            'total_amount' => $totalAmount,
        ];
    }

    /**
     * Calculate distance between two points using Haversine formula.
     */
    protected function calculateDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371; // km

        $lat1 = deg2rad($lat1);
        $lng1 = deg2rad($lng1);
        $lat2 = deg2rad($lat2);
        $lng2 = deg2rad($lng2);

        $dLat = $lat2 - $lat1;
        $dLng = $lng2 - $lng1;

        $a = sin($dLat / 2) ** 2 + cos($lat1) * cos($lat2) * sin($dLng / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }

    /**
     * Check if time is night time (10 PM - 6 AM).
     */
    protected function isNightTime(?string $scheduledAt): bool
    {
        if (!$scheduledAt) {
            return false;
        }

        $time = \Carbon\Carbon::parse($scheduledAt);
        $hour = $time->hour;

        return $hour >= 22 || $hour < 6;
    }
}