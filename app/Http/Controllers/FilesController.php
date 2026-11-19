<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use App\Services\ObjectStorageService;
use App\Services\FileGrantsService;

class FilesController extends Controller
{
    protected ObjectStorageService $storage;
    protected FileGrantsService $grants;

    public function __construct(ObjectStorageService $storage, FileGrantsService $grants)
    {
        $this->storage = $storage;
        $this->grants = $grants;
    }

    /**
     * POST /api/files/upload
     */
    public function upload(Request $request): JsonResponse
    {
        $grant = $this->grants->verifyGrant($request->input('grant'), 'upload');

        if (!$request->hasFile('file')) {
            return response()->json(['error' => 'file is required'], 400);
        }

        $file = $request->file('file');
        $mime = $file->getMimeType();

        if (!$mime || !$this->isMimeAllowed($mime, $grant['allowedMimeTypes']) || $file->getSize() > $grant['maxBytes']) {
            return response()->json(['error' => 'The file type or size is not allowed.'], 400);
        }

        try {
            $this->storage->ensureBucket($grant['bucket']);
            $this->storage->putObject(
                $grant['bucket'],
                $grant['path'],
                file_get_contents($file->getPathname()),
                $mime
            );

            return response()->json(['path' => $grant['path']], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Upload failed'], 500);
        }
    }

    /**
     * GET /api/files/private
     */
    public function privateDownload(Request $request): JsonResponse
    {
        $grant = $this->grants->verifyGrant($request->query('grant'), 'download');

        try {
            $file = $this->storage->getObject($grant['bucket'], $grant['path']);

            return response($file['body'])
                ->header('Content-Type', $file['contentType'] ?? 'application/octet-stream')
                ->header('Cache-Control', 'private, no-store');
        } catch (\Exception $e) {
            return response()->json(['error' => 'The download authorization is invalid or expired.'], 400);
        }
    }

    /**
     * GET /api/files/public/{bucket}/{path}
     */
    public function publicDownload(Request $request, string $bucket, string $path): JsonResponse
    {
        $publicBuckets = [
            config('alabiq.merchant_images.bucket'),
            config('alabiq.avatars.bucket'),
        ];

        if (!in_array($bucket, $publicBuckets)) {
            return response()->json(['error' => 'Not found'], 404);
        }

        // Prevent path traversal
        if (str_contains($path, '..')) {
            return response()->json(['error' => 'Invalid path'], 400);
        }

        try {
            $file = $this->storage->getObject($bucket, $path);

            return response($file['body'])
                ->header('Content-Type', $file['contentType'] ?? 'application/octet-stream')
                ->header('Cache-Control', 'public, max-age=86400, immutable');
        } catch (\Exception $e) {
            return response()->json(['error' => 'Not found'], 404);
        }
    }

    protected function isMimeAllowed(string $mime, array $allowed): bool
    {
        return in_array($mime, $allowed);
    }
}