<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AppUser extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $table = 'app_users';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'email',
        'password_hash',
        'email_verified_at',
        'disabled_at',
        'last_login_at',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'disabled_at' => 'datetime',
        'last_login_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * The app stores scrypt hashes in `password_hash` (Express-schema parity),
     * not Laravel's conventional `password` column. Pointing the session
     * guard's credential check at the right column keeps web login working
     * without touching the shared schema.
     */
    public function getAuthPasswordName(): string
    {
        return 'password_hash';
    }

    /**
     * Get the profile associated with the user.
     */
    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class, 'id', 'id');
    }

    /**
     * Get the sessions for the user.
     */
    public function sessions(): HasMany
    {
        return $this->hasMany(AppSession::class, 'user_id', 'id');
    }

    /**
     * Check if the user has a specific role.
     */
    public function hasRole(string $role): bool
    {
        return $this->profile?->role === $role;
    }

    /**
     * Check if the user is an admin.
     */
    public function isAdmin(): bool
    {
        return $this->hasRole('admin') || $this->isSuperAdmin();
    }

    /**
     * Check if the user is a super admin.
     */
    public function isSuperAdmin(): bool
    {
        return $this->profile?->is_super_admin === true;
    }

    /**
     * Get the user's email for password reset.
     */
    public function getEmailForPasswordReset(): string
    {
        return $this->email;
    }
}