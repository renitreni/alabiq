<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use App\Models\DriverDocument;
use App\Models\Booking;
use App\Models\Order;
use App\Models\ShopOrder;
use App\Models\Profile;
use App\Services\ObjectStorageService;

class DriverController extends Controller
{
    protected ObjectStorageService $storage;

    public function __construct(ObjectStorageService $storage)
    {
        $this->storage = $storage;
    }

    // POST /api/driver/documents/signed-url
    public function createDocUploadUrl(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'document_type' => 'required|string|max:30|in:license,id,vehicle_reg,insurance',
            'file_name' => 'required|string|max:255',
            'mime_type' => 'required|string|max:100',
        ]);

        $user = $request->user();

        $path = 'driver-documents/' . $user->id . '/' . \Illuminate\Support\Str::uuid() . '_' . $request->input('file_name');

        $uploadUrl = $this->storage->createSignedUploadUrl(
            config('alabiq.driver_documents.bucket'),
            $path,
            $request->input('mime_type'),
            config('alabiq.driver_documents.max_bytes')
        );

        return response()->json([
            'upload_url' => $uploadUrl,
            'path' => $path,
        ]);
    }

    // GET /api/driver/documents
    public function listMyDocuments(Request $request): JsonResponse
    {
        $user = $request->user();

        $documents = DriverDocument::where('driver_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['documents' => $documents]);
    }

    // GET /api/driver/deliveries
    public function listDeliveries(Request $request): JsonResponse
    {
        $user = $request->user();

        // TODO: Get driver's assigned deliveries
        return response()->json(['deliveries' => []]);
    }

    // GET /api/driver/deliveries/{code}
    public function getDelivery(Request $request, string $code): JsonResponse
    {
        // TODO: Get delivery details
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/driver/deliveries/{code}/accept
    public function acceptDelivery(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/driver/deliveries/{code}/pickup
    public function markPickup(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/driver/deliveries/{code}/delivered
    public function markDelivered(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/driver/deliveries/{code}/photo-url
    public function createDeliveryPhotoUrl(Request $request, string $code): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }

    // POST /api/driver/location
    public function updateLocation(Request $request): JsonResponse
    {
        return response()->json(['error' => 'Not yet implemented'], 501);
    }
}