<?php

namespace App\Hashing;

use Illuminate\Contracts\Hashing\Hasher as HasherContract;

/**
 * scrypt hasher compatible with the Node/Express backend (backend/lib/passwords.js).
 *
 * Hash format (must match Node exactly):
 *   scrypt$N$r$p$base64url(salt)$base64url(key)
 *
 * Parameters mirror Node: KEY_LENGTH=64, N=16384, r=8, p=1.
 * Legacy bcrypt hashes (imported Supabase users) verify transparently and
 * are flagged for rehash on next successful login, same as Node.
 */
class ScryptHasher implements HasherContract
{
    protected int $N = 16384; // 2^14, Node PARAMETERS.N

    protected int $r = 8;     // Node PARAMETERS.r

    protected int $p = 1;     // Node PARAMETERS.p

    protected int $keyLength = 64; // Node KEY_LENGTH

    /**
     * Hash the given value.
     */
    public function make($value, array $options = []): string
    {
        $N = $options['N'] ?? $this->N;
        $r = $options['r'] ?? $this->r;
        $p = $options['p'] ?? $this->p;
        $keyLength = $options['key_length'] ?? $this->keyLength;

        // Generate a random salt
        $salt = random_bytes(16);

        $hash = ScryptEngine::derive((string) $value, $salt, $N, $r, $p, $keyLength);

        // Format must match Node: scrypt$N$r$p$salt$key (base64url, no padding)
        return 'scrypt$'.$N.'$'.$r.'$'.$p.'$'.
               self::b64urlEncode($salt).'$'.
               self::b64urlEncode($hash);
    }

    /**
     * base64url encode without padding (Node Buffer.toString('base64url')).
     */
    private static function b64urlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * base64url decode (tolerates missing padding).
     */
    private static function b64urlDecode(string $data): string
    {
        $decoded = base64_decode(strtr($data, '-_', '+/'), true);
        if ($decoded === false) {
            throw new \InvalidArgumentException('Invalid base64url value');
        }

        return $decoded;
    }

    /**
     * Check the given plain value against a hash.
     */
    public function check($value, $hashedValue, array $options = []): bool
    {
        $hashedValue = (string) $hashedValue;

        // Our scrypt format (Node-compatible)
        if (str_starts_with($hashedValue, 'scrypt$')) {
            return $this->checkScrypt((string) $value, $hashedValue);
        }

        // Legacy bcrypt hashes (imported Supabase users)
        if (str_starts_with($hashedValue, '$2y$') || str_starts_with($hashedValue, '$2a$') || str_starts_with($hashedValue, '$2b$')) {
            return password_verify((string) $value, $hashedValue);
        }

        return false;
    }

    /**
     * Check a scrypt hash (Node format: scrypt$N$r$p$salt$key).
     */
    protected function checkScrypt(string $value, string $hashedValue): bool
    {
        $parts = explode('$', $hashedValue);

        if (count($parts) !== 6 || $parts[0] !== 'scrypt') {
            return false;
        }

        [, $nRaw, $rRaw, $pRaw, $saltRaw, $keyRaw] = $parts;

        $N = (int) $nRaw;
        $r = (int) $rRaw;
        $p = (int) $pRaw;

        // Bound stored parameters before doing expensive work (Node parity)
        if ($N < 16384 || $N > 32768 || ($N & ($N - 1)) !== 0) {
            return false;
        }
        if ($r < 1 || $r > 8 || $p < 1 || $p > 2) {
            return false;
        }

        try {
            $salt = self::b64urlDecode($saltRaw);
            $expectedHash = self::b64urlDecode($keyRaw);
        } catch (\Throwable) {
            return false;
        }

        $hash = ScryptEngine::derive($value, $salt, $N, $r, $p, strlen($expectedHash));

        return hash_equals($hash, $expectedHash);
    }

    /**
     * Determine if the hash needs to be rehashed.
     */
    public function needsRehash($hashedValue, array $options = []): bool
    {
        // Rehash bcrypt to scrypt on next successful login (Node parity)
        if (str_starts_with((string) $hashedValue, '$2y$') || str_starts_with((string) $hashedValue, '$2a$') || str_starts_with((string) $hashedValue, '$2b$')) {
            return true;
        }

        return false;
    }

    /**
     * Get information about the given hashed value.
     */
    public function info($hashedValue): array
    {
        $hashedValue = (string) $hashedValue;

        if (str_starts_with($hashedValue, 'scrypt$')) {
            $parts = explode('$', $hashedValue);

            return [
                'algo' => 'scrypt',
                'algoName' => 'scrypt',
                'options' => [
                    'N' => isset($parts[1]) ? (int) $parts[1] : null,
                    'r' => isset($parts[2]) ? (int) $parts[2] : null,
                    'p' => isset($parts[3]) ? (int) $parts[3] : null,
                ],
            ];
        }

        if (str_starts_with($hashedValue, '$2y$') || str_starts_with($hashedValue, '$2a$') || str_starts_with($hashedValue, '$2b$')) {
            return password_get_info($hashedValue);
        }

        return ['algo' => null, 'algoName' => 'unknown', 'options' => []];
    }
}
