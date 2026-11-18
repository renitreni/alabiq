<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Profile extends Model
{
    use HasFactory;

    protected $table = 'profiles';

    protected $primaryKey = 'id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'email',
        'full_name',
        'role',
        'date_of_birth',
        'gender',
        'national_id',
        'mobile_number',
        'whatsapp_number',
        'vehicle_type',
        'vehicle_plate',
        'driver_approved',
        'driver_verification_status',
        'service_types',
        'avatar_url',
        'address',
        'cash_owed',
        'cash_owed_limit',
        'is_super_admin',
        'disabled_at',
        'disabled_by',
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'driver_approved' => 'boolean',
        'service_types' => 'array',
        'cash_owed' => 'decimal:2',
        'cash_owed_limit' => 'decimal:2',
        'is_super_admin' => 'boolean',
        'disabled_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get the user that owns the profile.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(AppUser::class, 'id', 'id');
    }

    /**
     * Get the merchant owned by this profile.
     */
    public function merchant(): HasOne
    {
        return $this->hasOne(Merchant::class, 'owner_id', 'id');
    }

    /**
     * Get the disabled by profile.
     */
    public function disabledBy(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'disabled_by', 'id');
    }

    /**
     * Check if the profile has a specific role.
     */
    public function hasRole(string $role): bool
    {
        return $this->role === $role;
    }

    /**
     * Check if the profile is an admin.
     */
    public function isAdmin(): bool
    {
        return $this->role === 'admin' || $this->is_super_admin;
    }

    /**
     * Check if the profile is a driver.
     */
    public function isDriver(): bool
    {
        return $this->role === 'driver';
    }

    /**
     * Check if the profile is a merchant.
     */
    public function isMerchant(): bool
    {
        return $this->role === 'merchant';
    }
}