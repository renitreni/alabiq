<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MerchantHour extends Model
{
    use HasFactory;

    protected $table = 'merchant_hours';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'merchant_id',
        'weekday',
        'opens_at',
        'closes_at',
    ];

    protected $casts = [
        'weekday' => 'integer',
        'opens_at' => 'datetime:H:i',
        'closes_at' => 'datetime:H:i',
    ];

    /**
     * Get the merchant that owns the hours.
     */
    public function merchant(): BelongsTo
    {
        return $this->belongsTo(Merchant::class, 'merchant_id', 'id');
    }
}