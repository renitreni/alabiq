<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FileGrantsService
{
    /**
     * Verify a file grant token.
     */
    public function verifyGrant(?string $grant, string $action): ?array
    {
        if (!$grant) {
            return null;
        }

        // Decode the grant (format: base64 encoded JSON)
        try {
            $data = json_decode(base64_decode($grant), true);
        } catch (\Exception $e) {
            return null;
        }

        if (!$data || !isset($data['bucket'], $data['path'], $data['action'], $data['expires_at'])) {
            return null;
        }

        if ($data['action'] !== $action) {
            return null;
        }

        if (now()->timestamp > $data['expires_at']) {
            return null;
        }

        // Verify bucket matches config
        $allowedBuckets = [
            config('alabiq.proofs.bucket'),
            config('alabiq.merchant_images.bucket'),
            config('alabiq.avatars.bucket'),
            config('alabiq.driver_docs.bucket'),
        ];

        if (!in_array($data['bucket'], $allowedBuckets)) {
            return null;
        }

        return $data;
    }

    /**
     * Create a new file grant.
     */
    public function createGrant(string $bucket, string $path, string $action, int $ttlSeconds, array $allowedMimeTypes, int $maxBytes): string
    {
        $data = [
            'bucket' => $bucket,
            'path' => $path,
            'action' => $action,
            'expires_at' => now()->addSeconds($ttlSeconds)->timestamp,
            'allowedMimeTypes' => $allowedMimeTypes,
            'maxBytes' => $maxBytes,
        ];

        return base64_encode(json_encode($data));
    }
}