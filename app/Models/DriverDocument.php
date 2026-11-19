<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverDocument extends Model
{
    protected $table = 'driver_documents';

    protected $fillable = [
        'driver_id',
        'document_type',
        'path',
        'status',
        'reject_reason',
        'reviewed_at',
        'reviewed_by',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'driver_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'reviewed_by');
    }
}