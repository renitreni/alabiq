<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BackgroundJob extends Model
{
    use HasFactory;

    protected $table = 'background_jobs';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'kind',
        'payload',
        'run_at',
        'max_attempts',
        'attempts',
        'lease_owner',
        'lease_expires_at',
        'completed_at',
        'error',
    ];

    protected $casts = [
        'payload' => 'array',
        'run_at' => 'datetime',
        'max_attempts' => 'integer',
        'attempts' => 'integer',
        'lease_expires_at' => 'datetime',
        'completed_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}