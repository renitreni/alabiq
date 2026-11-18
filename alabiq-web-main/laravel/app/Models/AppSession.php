<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppSession extends Model
{
    use HasFactory;

    protected $table = 'app_sessions';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'token_hash',
        'user_id',
        'last_seen_at',
        'idle_expires_at',
        'absolute_expires_at',
        'revoked_at',
        'user_agent',
        'ip',
    ];

    protected $casts = [
        'last_seen_at' => 'datetime',
        'idle_expires_at' => 'datetime',
        'absolute_expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    /**
     * Get the user that owns the session.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(AppUser::class, 'user_id', 'id');
    }

    /**
     * Check if the session is valid (not expired or revoked).
     */
    public function isValid(): bool
    {
        $now = now();
        return !$this->revoked_at
            && $this->idle_expires_at > $now
            && $this->absolute_expires_at > $now;
    }
}