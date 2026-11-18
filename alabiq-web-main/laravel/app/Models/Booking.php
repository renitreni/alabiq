<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Booking extends Model
{
    use HasFactory;

    protected $table = 'bookings';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'booking_code',
        'user_id',
        'driver_id',
        'status',
        'service_type',
        'pickup_lat',
        'pickup_lng',
        'pickup_address',
        'pickup_street',
        'pickup_building',
        'dropoff_lat',
        'dropoff_lng',
        'dropoff_address',
        'dropoff_street',
        'dropoff_building',
        'passenger_name',
        'passenger_mobile',
        'passenger_whatsapp',
        'flight_number',
        'terminal',
        'scheduled_at',
        'distance_km',
        'duration_min',
        'fare_amount',
        'platform_fee',
        'driver_fee',
        'vat_amount',
        'total_amount',
        'payment_method',
        'payment_status',
        'payment_proof_path',
        'payment_reference',
        'notes',
        'cancelled_at',
        'cancelled_by',
        'cancel_reason',
        'accepted_at',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'pickup_lat' => 'decimal:8',
        'pickup_lng' => 'decimal:8',
        'dropoff_lat' => 'decimal:8',
        'dropoff_lng' => 'decimal:8',
        'distance_km' => 'decimal:2',
        'duration_min' => 'integer',
        'fare_amount' => 'decimal:2',
        'platform_fee' => 'decimal:2',
        'driver_fee' => 'decimal:2',
        'vat_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'scheduled_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'accepted_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the user (passenger) who made the booking.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'user_id', 'id');
    }

    /**
     * Get the driver assigned to the booking.
     */
    public function driver(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'driver_id', 'id');
    }

    /**
     * Get the payment proof.
     */
    public function paymentProof(): HasOne
    {
        return $this->hasOne(PaymentProof::class, 'booking_id', 'id');
    }

    /**
     * Get the tracking events.
     */
    public function trackingEvents(): HasMany
    {
        return $this->hasMany(TrackingEvent::class, 'booking_id', 'id');
    }
}