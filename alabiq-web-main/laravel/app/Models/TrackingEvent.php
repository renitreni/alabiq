<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TrackingEvent extends Model
{
    use HasFactory;

    protected $table = 'tracking_events';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'booking_id',
        'order_id',
        'shop_order_id',
        'event_type',
        'description',
        'lat',
        'lng',
        'metadata',
    ];

    protected $casts = [
        'lat' => 'decimal:8',
        'lng' => 'decimal:8',
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

    /**
     * Get the booking associated with the event.
     */
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class, 'booking_id', 'id');
    }

    /**
     * Get the food order associated with the event.
     */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id', 'id');
    }

    /**
     * Get the shop order associated with the event.
     */
    public function shopOrder(): BelongsTo
    {
        return $this->belongsTo(ShopOrder::class, 'shop_order_id', 'id');
    }
}