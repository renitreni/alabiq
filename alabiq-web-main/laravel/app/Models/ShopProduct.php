<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShopProduct extends Model
{
    protected $table = 'shop_products';

    protected $fillable = [
        'merchant_id',
        'category_id',
        'name',
        'description',
        'brand',
        'unit',
        'weight_grams',
        'barcode',
        'price',
        'net_price',
        'image_url',
        'stock_quantity',
        'low_stock_threshold',
        'track_stock',
        'is_available',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'net_price' => 'decimal:2',
        'weight_grams' => 'integer',
        'stock_quantity' => 'integer',
        'low_stock_threshold' => 'integer',
        'track_stock' => 'boolean',
        'is_available' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function merchant(): BelongsTo
    {
        return $this->belongsTo(Merchant::class, 'merchant_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ShopCategory::class, 'category_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ShopProductVariant::class, 'product_id');
    }
}