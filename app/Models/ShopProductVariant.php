<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShopProductVariant extends Model
{
    protected $table = 'shop_product_variants';

    protected $fillable = [
        'product_id',
        'sku',
        'label',
        'price',
        'net_price',
        'stock_quantity',
        'sort_order',
        'is_available',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'net_price' => 'decimal:2',
        'stock_quantity' => 'integer',
        'sort_order' => 'integer',
        'is_available' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(ShopProduct::class, 'product_id');
    }
}