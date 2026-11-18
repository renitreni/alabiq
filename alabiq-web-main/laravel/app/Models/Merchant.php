<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Merchant extends Model
{
    use HasFactory;

    protected $table = 'merchants';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'owner_id',
        'vertical',
        'name',
        'cuisine_type',
        'description',
        'logo_url',
        'address',
        'street',
        'building_number',
        'lat',
        'lng',
        'service_radius_km',
        'is_active',
        'status',
        'accepting_orders',
        'credit_limit',
        'credit_used',
        'is_featured',
        'badge',
        'public_hash',
        'brand_color',
    ];

    protected $casts = [
        'lat' => 'decimal:8',
        'lng' => 'decimal:8',
        'service_radius_km' => 'decimal:2',
        'is_active' => 'boolean',
        'accepting_orders' => 'boolean',
        'credit_limit' => 'decimal:2',
        'credit_used' => 'decimal:2',
        'is_featured' => 'boolean',
        'created_at' => 'datetime',
    ];

    /**
     * Get the owner of the merchant.
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'owner_id', 'id');
    }

    /**
     * Get the merchant hours.
     */
    public function hours(): HasMany
    {
        return $this->hasMany(MerchantHour::class, 'merchant_id', 'id');
    }

    /**
     * Check if the merchant is a restaurant (food vertical).
     */
    public function isFood(): bool
    {
        return $this->vertical === 'food';
    }

    /**
     * Check if the merchant is a store (shop vertical).
     */
    public function isShop(): bool
    {
        return $this->vertical === 'shop';
    }
}