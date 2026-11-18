<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ErrorLog extends Model
{
    use HasFactory;

    protected $table = 'error_logs';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'occurred_at',
        'severity',
        'label',
        'message',
        'error_name',
        'stack',
        'request_id',
        'method',
        'path',
        'status_code',
        'ip',
        'user_agent',
        'user_id',
        'user_email',
        'user_role',
        'fingerprint',
        'suppressed_count',
        'resolved_at',
        'resolved_by',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
        'status_code' => 'integer',
        'suppressed_count' => 'integer',
        'resolved_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}