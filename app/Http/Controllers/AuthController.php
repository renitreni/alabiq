<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Models\AppUser;
use App\Models\Profile;
use App\Models\AppSession;
use App\Services\AppSessionsService;
use App\Services\EmailService;
use App\Services\ObjectStorageService;

class AuthController extends Controller
{
    protected AppSessionsService $sessions;
    protected EmailService $email;
    protected ObjectStorageService $storage;

    public function __construct(
        AppSessionsService $sessions,
        EmailService $email,
        ObjectStorageService $storage
    ) {
        $this->sessions = $sessions;
        $this->email = $email;
        $this->storage = $storage;
    }

    public function login(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email|max:254',
            'password' => 'required|string|max:128',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $email = strtolower(trim($request->input('email')));
        $password = $request->input('password');

        $user = AppUser::whereRaw('LOWER(email) = ?', [$email])->first();

        if (!$user || $user->disabled_at) {
            return response()->json(['error' => 'Invalid credentials'], 401);
        }

        if (!Hash::check($password, $user->password_hash)) {
            return response()->json(['error' => 'Invalid credentials'], 401);
        }

        $user->last_login_at = now();
        $user->save();

        $session = $this->sessions->createSession($user, $request);

        $profile = $user->profile;
        if (!$profile) {
            $profile = Profile::create([
                'id' => $user->id,
                'email' => $user->email,
                'role' => 'passenger',
                'service_types' => ['pick_drop', 'food', 'shop'],
                'cash_owed' => 0,
                'cash_owed_limit' => 500,
            ]);
        }

        $adminEmails = config('alabiq.admin_emails', []);
        if (in_array(strtolower($user->email), array_map('strtolower', $adminEmails))) {
            $profile->role = 'admin';
            $profile->is_super_admin = true;
            $profile->save();
        }

        return response()->json([
            'token' => $session['token'],
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'profile' => [
                    'id' => $profile->id,
                    'role' => $profile->role,
                    'full_name' => $profile->full_name,
                    'driver_approved' => $profile->driver_approved,
                    'service_types' => $profile->service_types,
                ],
            ],
        ]);
    }

    public function session(Request $request): JsonResponse
    {
        $user = Auth::guard('api')->user();

        if (!$user) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        $profile = $user->profile;

        return response()->json([
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'profile' => $profile ? [
                    'id' => $profile->id,
                    'role' => $profile->role,
                    'full_name' => $profile->full_name,
                    'driver_approved' => $profile->driver_approved,
                    'service_types' => $profile->service_types,
                ] : null,
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->sessions->revokeSession($request);
        return response()->json(['success' => true]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'password' => 'required|string|min:8|max:128',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();
        $user->password_hash = Hash::make($request->input('password'));
        $user->save();

        $this->sessions->revokeAll($user->id);

        return response()->json(['success' => true]);
    }

    public function requestPasswordReset(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email|max:254',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $email = strtolower(trim($request->input('email')));
        $user = AppUser::whereRaw('LOWER(email) = ?', [$email])->first();

        if ($user && !$user->disabled_at) {
            $this->sessions->createPasswordResetFlow($user);
            $this->email->sendPasswordReset($user);
        }

        return response()->json(['success' => true]);
    }

    public function exchangePasswordReset(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'token' => 'required|string|max:128',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $token = $request->input('token');
        $flow = $this->sessions->exchangePasswordResetToken($token);

        if (!$flow) {
            return response()->json(['error' => 'Invalid or expired reset token'], 400);
        }

        return response()->json(['ticket' => $flow->ticket]);
    }

    public function completePasswordReset(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'ticket' => 'required|string|max:128',
            'password' => 'required|string|min:8|max:128',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $result = $this->sessions->completePasswordReset(
            $request->input('ticket'),
            $request->input('password')
        );

        if (!$result) {
            return response()->json(['error' => 'Invalid or expired reset ticket'], 400);
        }

        return response()->json(['success' => true]);
    }

    public function signup(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string|email|max:254',
            'password' => 'required|string|min:8|max:128',
            'full_name' => 'nullable|string|max:120',
            'mobile_number' => 'nullable|string|max:40',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $email = strtolower(trim($request->input('email')));

        if (AppUser::whereRaw('LOWER(email) = ?', [$email])->exists()) {
            return response()->json(['error' => 'An account with this email already exists'], 409);
        }

        DB::transaction(function () use ($request, $email) {
            $user = AppUser::create([
                'id' => Str::uuid(),
                'email' => $email,
                'password_hash' => Hash::make($request->input('password')),
                'email_verified_at' => now(),
            ]);

            Profile::create([
                'id' => $user->id,
                'email' => $user->email,
                'full_name' => $request->input('full_name'),
                'mobile_number' => $request->input('mobile_number'),
                'role' => 'passenger',
                'service_types' => ['pick_drop', 'food', 'shop'],
                'cash_owed' => 0,
                'cash_owed_limit' => 500,
            ]);
        });

        return response()->json(['success' => true], 201);
    }

    public function syncProfile(Request $request): JsonResponse
    {
        $user = Auth::guard('api')->user();

        $profile = $user->profile;
        if (!$profile) {
            return response()->json(['error' => 'Profile not set up'], 403);
        }

        $adminEmails = config('alabiq.admin_emails', []);
        if (in_array(strtolower($user->email), array_map('strtolower', $adminEmails))) {
            $profile->role = 'admin';
            $profile->is_super_admin = true;
            $profile->save();
        }

        return response()->json([
            'profile' => [
                'id' => $profile->id,
                'role' => $profile->role,
                'full_name' => $profile->full_name,
                'driver_approved' => $profile->driver_approved,
                'service_types' => $profile->service_types,
            ],
        ]);
    }

    public function recordLoginEvent(Request $request): JsonResponse
    {
        $user = Auth::guard('api')->user();

        if ($user->hasRole('admin')) {
            DB::table('admin_login_events')->insert([
                'profile_id' => $user->id,
                'email' => $user->email,
                'role' => $user->profile?->role ?? 'admin',
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'occurred_at' => now(),
            ]);
        }

        return response()->json(['success' => true]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'full_name' => 'nullable|string|max:120',
            'mobile_number' => 'nullable|string|max:40',
            'whatsapp_number' => 'nullable|string|max:40',
            'address' => 'nullable|string|max:500',
            'avatar_url' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();
        $profile = $user->profile;

        if (!$profile) {
            return response()->json(['error' => 'Profile not set up'], 403);
        }

        $profile->fill($validator->validated());
        $profile->save();

        return response()->json(['success' => true]);
    }

    public function createAvatarUploadUrl(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'file_name' => 'required|string|max:255',
            'mime_type' => 'required|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()->all(),
            ], 400);
        }

        $user = Auth::guard('api')->user();
        $path = 'avatars/' . $user->id . '/' . Str::uuid() . '_' . $request->input('file_name');

        $uploadUrl = $this->storage->createSignedUploadUrl(
            config('alabiq.avatars.bucket'),
            $path,
            $request->input('mime_type'),
            config('alabiq.avatars.max_bytes')
        );

        return response()->json([
            'upload_url' => $uploadUrl,
            'path' => $path,
        ]);
    }

    public function deleteAccount(Request $request): JsonResponse
    {
        $user = Auth::guard('api')->user();

        $this->sessions->revokeAll($user->id);

        $user->disabled_at = now();
        $user->save();

        $profile = $user->profile;
        if ($profile) {
            $profile->disabled_at = now();
            $profile->save();
        }

        return response()->json(['success' => true]);
    }
}
