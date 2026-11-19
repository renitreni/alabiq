<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ShopOrder extends Model
{
    use HasFactory;

    protected $table = 'shop_orders';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'order_code',
        'user_id',
        'merchant_id',
        'driver_id',
        'status',
        'delivery_lat',
        'delivery_lng',
        'delivery_address',
        'delivery_street',
        'delivery_building',
        'contact_phone',
        'subtotal',
        'delivery_fee',
        'platform_fee',
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
        'packing_at',
        'ready_at',
        'picked_up_at',
        'delivered_at',
        'distance_km',
    ];

    protected $casts = [
        'delivery_lat' => 'decimal:8',
        'delivery_lng' => 'decimal:8',
        'subtotal' => 'decimal:2',
        'delivery_fee' => 'decimal:2',
        'platform_fee' => 'decimal:2',
        'vat_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'distance_km' => 'decimal:2',
        'cancelled_at' => 'datetime',
        'accepted_at' => 'datetime',
        'packing_at' => 'datetime',
        'ready_at' => 'datetime',
        'picked_up_at' => 'datetime',
        'delivered_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the user (customer) who placed the order.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'user_id', 'id');
    }

    /**
     * Get the merchant (store) for the order.
     */
    public function merchant(): BelongsTo
    {
        return $this->belongsTo(Merchant::class, 'merchant_id', 'id');
    }

    /**
     * Get the driver assigned to the order.
     */
    public function driver(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'driver_id', 'id');
    }

    /**
     * Get the order items.
     */
    public function items(): HasMany
    {
        return $this->hasMany(ShopOrderItem::class, 'shop_order_id', 'id');
    }

    /**
     * Get the payment proof.
     */
    public function paymentProof(): HasOne
    {
        return $this->hasOne(PaymentProof::class, 'shop_order_id', 'id');
    }
}