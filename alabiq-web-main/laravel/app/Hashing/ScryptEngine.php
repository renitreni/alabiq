<?php

namespace App\Hashing;

/**
 * Pure-PHP scrypt (RFC 7914).
 *
 * PHP's libsodium binding cannot reproduce the Node/Express hashes: its
 * high-level scrypt API requires a 32-byte salt while Node uses 16 bytes,
 * and PHP does not expose libsodium's low-level raw (N, r, p) API.
 * This engine exists solely to stay byte-compatible with
 * backend/lib/passwords.js (Node crypto.scrypt, 16-byte salt, N=16384, r=8,
 * p=1, dkLen=64).
 *
 * Not constant-time beyond the final hash_equals comparison — acceptable here
 * because scrypt salts are random per password.
 */
class ScryptEngine
{
    /**
     * scrypt(P, S, N, r, p, dkLen) per RFC 7914 §6.
     */
    public static function derive(string $password, string $salt, int $N, int $r, int $p, int $dkLen): string
    {
        if ($N <= 1 || ($N & ($N - 1)) !== 0 || $N > PHP_INT_MAX >> 1) {
            throw new \InvalidArgumentException('N must be a power of two greater than 1');
        }
        if ($r < 1 || $p < 1) {
            throw new \InvalidArgumentException('r and p must be positive');
        }

        // B = PBKDF2-HMAC-SHA256(P, S, 1, p * 128 * r)
        $B = hash_pbkdf2('sha256', $password, $salt, 1, $p * 128 * $r, true);

        // B_i = ROMix(B_i, N) for each of the p chunks
        $chunkLen = 128 * $r;
        for ($i = 0; $i < $p; $i++) {
            $chunk = substr($B, $i * $chunkLen, $chunkLen);
            $mixed = self::romix($chunk, $N, $r);
            $B = substr_replace($B, $mixed, $i * $chunkLen, $chunkLen);
        }

        // DK = PBKDF2-HMAC-SHA256(P, B, 1, dkLen)
        return hash_pbkdf2('sha256', $password, $B, 1, $dkLen, true);
    }

    /**
     * ROMix(r, B, N) per RFC 7914 §5.
     */
    private static function romix(string $B, int $N, int $r): string
    {
        // X as an array of 2r 64-byte blocks
        $X = str_split($B, 64);
        $V = [];

        for ($i = 0; $i < $N; $i++) {
            $V[] = implode('', $X);
            $X = self::blockMix($X, $r);
        }

        for ($i = 0; $i < $N; $i++) {
            // Integerify(X): LE integer from the LAST 64-byte block.
            // N is a power of two <= 2^15 here, so the low 32 bits decide j.
            $last = $X[2 * $r - 1];
            $j = unpack('V', substr($last, 0, 4))[1] % $N;

            $T = str_split($V[$j] ^ implode('', $X), 64);
            $X = self::blockMix($T, $r);
        }

        return implode('', $X);
    }

    /**
     * BlockMix_salsa8(B) per RFC 7914 §3, operating on 64-byte blocks.
     *
     * @param  array<int, string>  $B  2r blocks of 64 bytes
     * @return array<int, string>  2r blocks of 64 bytes
     */
    private static function blockMix(array $B, int $r): array
    {
        $X = $B[2 * $r - 1];
        $Y = [];

        for ($i = 0; $i < 2 * $r; $i++) {
            $X = self::salsa208($X ^ $B[$i]);
            $Y[] = $X;
        }

        // B' = (Y_0, Y_2, ..., Y_{2r-2}, Y_1, Y_3, ..., Y_{2r-1})
        $out = [];
        for ($i = 0; $i < $r; $i++) {
            $out[] = $Y[2 * $i];
        }
        for ($i = 0; $i < $r; $i++) {
            $out[] = $Y[2 * $i + 1];
        }

        return $out;
    }

    /**
     * Salsa20/8 core on a single 64-byte block.
     */
    private static function salsa208(string $block): string
    {
        $x = array_values(unpack('V16', $block));
        $z = $x;

        for ($round = 0; $round < 8; $round += 2) {
            // column round (rotation order 7,9,13,18 — per crypto_scrypt-ref.c)
            $z[4] = ($z[4] ^ self::rotl($z[0] + $z[12], 7)) & 0xFFFFFFFF;
            $z[8] = ($z[8] ^ self::rotl($z[4] + $z[0], 9)) & 0xFFFFFFFF;
            $z[12] = ($z[12] ^ self::rotl($z[8] + $z[4], 13)) & 0xFFFFFFFF;
            $z[0] = ($z[0] ^ self::rotl($z[12] + $z[8], 18)) & 0xFFFFFFFF;

            $z[9] = ($z[9] ^ self::rotl($z[5] + $z[1], 7)) & 0xFFFFFFFF;
            $z[13] = ($z[13] ^ self::rotl($z[9] + $z[5], 9)) & 0xFFFFFFFF;
            $z[1] = ($z[1] ^ self::rotl($z[13] + $z[9], 13)) & 0xFFFFFFFF;
            $z[5] = ($z[5] ^ self::rotl($z[1] + $z[13], 18)) & 0xFFFFFFFF;

            $z[14] = ($z[14] ^ self::rotl($z[10] + $z[6], 7)) & 0xFFFFFFFF;
            $z[2] = ($z[2] ^ self::rotl($z[14] + $z[10], 9)) & 0xFFFFFFFF;
            $z[6] = ($z[6] ^ self::rotl($z[2] + $z[14], 13)) & 0xFFFFFFFF;
            $z[10] = ($z[10] ^ self::rotl($z[6] + $z[2], 18)) & 0xFFFFFFFF;

            $z[3] = ($z[3] ^ self::rotl($z[15] + $z[11], 7)) & 0xFFFFFFFF;
            $z[7] = ($z[7] ^ self::rotl($z[3] + $z[15], 9)) & 0xFFFFFFFF;
            $z[11] = ($z[11] ^ self::rotl($z[7] + $z[3], 13)) & 0xFFFFFFFF;
            $z[15] = ($z[15] ^ self::rotl($z[11] + $z[7], 18)) & 0xFFFFFFFF;

            // row round
            $z[1] = ($z[1] ^ self::rotl($z[0] + $z[3], 7)) & 0xFFFFFFFF;
            $z[2] = ($z[2] ^ self::rotl($z[1] + $z[0], 9)) & 0xFFFFFFFF;
            $z[3] = ($z[3] ^ self::rotl($z[2] + $z[1], 13)) & 0xFFFFFFFF;
            $z[0] = ($z[0] ^ self::rotl($z[3] + $z[2], 18)) & 0xFFFFFFFF;

            $z[6] = ($z[6] ^ self::rotl($z[5] + $z[4], 7)) & 0xFFFFFFFF;
            $z[7] = ($z[7] ^ self::rotl($z[6] + $z[5], 9)) & 0xFFFFFFFF;
            $z[4] = ($z[4] ^ self::rotl($z[7] + $z[6], 13)) & 0xFFFFFFFF;
            $z[5] = ($z[5] ^ self::rotl($z[4] + $z[7], 18)) & 0xFFFFFFFF;

            $z[11] = ($z[11] ^ self::rotl($z[10] + $z[9], 7)) & 0xFFFFFFFF;
            $z[8] = ($z[8] ^ self::rotl($z[11] + $z[10], 9)) & 0xFFFFFFFF;
            $z[9] = ($z[9] ^ self::rotl($z[8] + $z[11], 13)) & 0xFFFFFFFF;
            $z[10] = ($z[10] ^ self::rotl($z[9] + $z[8], 18)) & 0xFFFFFFFF;

            $z[12] = ($z[12] ^ self::rotl($z[15] + $z[14], 7)) & 0xFFFFFFFF;
            $z[13] = ($z[13] ^ self::rotl($z[12] + $z[15], 9)) & 0xFFFFFFFF;
            $z[14] = ($z[14] ^ self::rotl($z[13] + $z[12], 13)) & 0xFFFFFFFF;
            $z[15] = ($z[15] ^ self::rotl($z[14] + $z[13], 18)) & 0xFFFFFFFF;
        }

        $out = [];
        for ($i = 0; $i < 16; $i++) {
            $out[] = ($z[$i] + $x[$i]) & 0xFFFFFFFF;
        }

        return pack('V16', ...$out);
    }

    private static function rotl(int $x, int $n): int
    {
        // Truncate to 32 bits BEFORE shifting: callers pass unmasked sums and
        // the right-hand shift would otherwise leak carry bits into the result
        // (C operates on uint32; PHP ints are 64-bit).
        $x &= 0xFFFFFFFF;

        return (($x << $n) | ($x >> (32 - $n))) & 0xFFFFFFFF;
    }
}
