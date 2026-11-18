<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Aws\S3\S3Client;
use Aws\Exception\AwsException;

class ObjectStorageService
{
    protected S3Client $client;

    public function __construct()
    {
        $this->client = new S3Client([
            'version' => 'latest',
            'region' => config('alabiq.object_storage.region'),
            'endpoint' => config('alabiq.object_storage.endpoint'),
            'credentials' => [
                'key' => config('alabiq.object_storage.access_key'),
                'secret' => config('alabiq.object_storage.secret_key'),
            ],
            'use_path_style_endpoint' => config('alabiq.object_storage.force_path_style'),
        ]);
    }

    /**
     * Ensure bucket exists.
     */
    public function ensureBucket(string $bucket): void
    {
        try {
            $this->client->headBucket(['Bucket' => $bucket]);
        } catch (AwsException $e) {
            if ($e->getAwsErrorCode() === 'NotFound' || $e->getAwsErrorCode() === '404') {
                $this->client->createBucket(['Bucket' => $bucket]);
            } else {
                throw $e;
            }
        }
    }

    /**
     * Put an object.
     */
    public function putObject(string $bucket, string $path, string $content, string $contentType): void
    {
        $this->ensureBucket($bucket);

        $this->client->putObject([
            'Bucket' => $bucket,
            'Key' => $path,
            'Body' => $content,
            'ContentType' => $contentType,
        ]);
    }

    /**
     * Get an object.
     */
    public function getObject(string $bucket, string $path): array
    {
        $result = $this->client->getObject([
            'Bucket' => $bucket,
            'Key' => $path,
        ]);

        return [
            'body' => (string) $result['Body'],
            'contentType' => $result['ContentType'] ?? 'application/octet-stream',
        ];
    }

    /**
     * Create a signed upload URL.
     */
    public function createSignedUploadUrl(
        string $bucket,
        string $path,
        string $contentType,
        int $maxBytes
    ): string {
        $this->ensureBucket($bucket);

        $command = $this->client->getCommand('PutObject', [
            'Bucket' => $bucket,
            'Key' => $path,
            'ContentType' => $contentType,
        ]);

        $request = $this->client->createPresignedRequest($command, '+15 minutes');

        return (string) $request->getUri();
    }

    /**
     * Create a signed download URL.
     */
    public function createSignedDownloadUrl(
        string $bucket,
        string $path,
        int $ttlSeconds
    ): string {
        $command = $this->client->getCommand('GetObject', [
            'Bucket' => $bucket,
            'Key' => $path,
        ]);

        $request = $this->client->createPresignedRequest($command, "+{$ttlSeconds} seconds");

        return (string) $request->getUri();
    }

    /**
     * Delete an object.
     */
    public function deleteObject(string $bucket, string $path): void
    {
        $this->client->deleteObject([
            'Bucket' => $bucket,
            'Key' => $path,
        ]);
    }
}