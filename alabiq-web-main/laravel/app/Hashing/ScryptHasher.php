<?php

namespace App\Hashing;

use Illuminate\Contracts\Hashing\Hasher as HasherContract;
use ParagonIE\ConstantTimeEncoding\Base64UrlSafe;
use ParagonIE\ConstantTimeEncoding\Hex;

class ScryptHasher implements HasherContract
{
    /**
     * The cost factor for scrypt.
     */
    protected int $N = 16384; // 2^14

    /**
     * The block size for scrypt.
     */
    protected int $r = 8;

    /**
     * The parallelization factor for scrypt.
     */
    protected int $p = 1;

    /**
     * The output length for scrypt.
     */
    protected int $keyLength = 32;

    /**
     * Hash the given value.
     */
    public function make(string $value, array $options = []): string
    {
        $N = $options['N'] ?? $this->N;
        $r = $options['r'] ?? $this->r;
        $p = $options['p'] ?? $this->p;
        $keyLength = $options['key_length'] ?? $this->keyLength;

        // Generate a random salt
        $salt = random_bytes(16);

        // Use PHP's sodium scrypt implementation
        if (extension_loaded('sodium')) {
            $hash = sodium_crypto_pwhash_scryptsalsa208sha256(
                $keyLength,
                $value,
                $salt,
                $N,
                $r,
                $p
            );
        } else {
            // Fallback to hash_pbkdf2 with scrypt-like parameters (not true scrypt)
            // This is a last resort - sodium should be available
            $hash = hash_pbkdf2('sha256', $value, $salt, 1, $keyLength, true);
        }

        // Format: $scrypt$N=$N$r=$r$p=$p$salt$hash
        return '$scrypt$N=' . $N . '$r=' . $r . '$p=' . $p . '$' .
               Base64UrlSafe::encode($salt) . '$' .
               Base64UrlSafe::encode($hash);
    }

    /**
     * Check the given plain value against a hash.
     */
    public function check(string $value, string $hashedValue, array $options = []): bool
    {
        // Check if it's our scrypt format
        if (str_starts_with($hashedValue, '$scrypt$')) {
            return $this->checkScrypt($value, $hashedValue);
        }

        // Check if it's bcrypt (for imported Supabase users)
        if (str_starts_with($hashedValue, '$2y$') || str_starts_with($hashedValue, '$2a$') || str_starts_with($hashedValue, '$2b$')) {
            return password_verify($value, $hashedValue);
        }

        return false;
    }

    /**
     * Check a scrypt hash.
     */
    protected function checkScrypt(string $value, string $hashedValue): bool
    {
        // Parse the hash format: $scrypt$N=16384$r=8$p=1$salt$hash
        $parts = explode('$', $hashedValue);

        if (count($parts) < 6 || $parts[1] !== 'scrypt') {
            return false;
        }

        $params = [];
        for ($i = 2; $i < 5; $i++) {
            [$key, $val] = explode('=', $parts[$i], 2);
            $params[$key] = (int) $val;
        }

        $salt = Base64UrlSafe::decode($parts[5]);
        $expectedHash = Base64UrlSafe::decode($parts[6]);

        if (extension_loaded('sodium')) {
            $hash = sodium_crypto_pwhash_scryptsalsa208sha256(
                strlen($expectedHash),
                $value,
                $salt,
                $params['N'] ?? $this->N,
                $params['r'] ?? $this->r,
                $params['p'] ?? $this->p
            );

            return hash_equals($hash, $expectedHash);
        }

        return false;
    }

    /**
     * Determine if the hash needs to be rehashed.
     */
    public function needsRehash(string $hashedValue, array $options = []): bool
    {
        // Always return false for scrypt - we don't auto-rehash
        // If it's bcrypt, we might want to rehash to scrypt on next login
        if (str_starts_with($hashedValue, '$2y$') || str_starts_with($hashedValue, '$2a$') || str_starts_with($hashedValue, '$2b$')) {
            return true; // Rehash bcrypt to scrypt
        }
        return false;
    }
}