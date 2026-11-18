<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Models\AppUser;
use App\Models\AppSession;
use App\Models\PasswordResetFlow;
use App\Models\PasswordResetToken;

class AppSessionsService
{
    const IDLE_DAYS = 30;
    const ABSOLUTE_DAYS = 90;
    const TOUCH_EVERY_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Hash a token using SHA-256.
     */
    public function hashToken(string $value): string
    {
        return hash('sha256', $value);
    }

    /**
     * Extract bearer token from request.
     */
    public function bearer(Request $request): ?string
    {
        $match = [];
        if (preg_match('/^Bearer\s+(.+)$/i', $request->header('Authorization') ?? '', $match)) {
            return $match[1];
        }
        return null;
    }

    /**
     * Create a new session for a user.
     */
    public function createSession(AppUser $user, Request $request): array
    {
        $token = Str::random(43); // base64url encoded 32 bytes
        $now = now()->timestamp * 1000;

        // Prune old sessions
        $this->prune($now);

        $session = AppSession::create([
            'id' => Str::uuid(),
            'token_hash' => $this->hashToken($token),
            'user_id' => $user->id,
            'last_seen_at' => now(),
            'idle_expires_at' => now()->addDays(self::IDLE_DAYS),
            'absolute_expires_at' => now()->addDays(self::ABSOLUTE_DAYS),
            'user_agent' => $request->userAgent() ? substr($request->userAgent(), 0, 500) : null,
            'ip' => $request->ip(),
        ]);

        return [
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
            ],
        ];
    }

    /**
     * Find a valid session by token.
     */
    public function findSession(Request $request): ?AppSession
    {
        $token = $this->bearer($request);
        if (!$token) {
            return null;
        }

        $now = now();
        $tokenHash = $this->hashToken($token);

        $session = AppSession::where('token_hash', $tokenHash)
            ->where('idle_expires_at', '>', $now)
            ->where('absolute_expires_at', '>', $now)
            ->whereNull('revoked_at')
            ->first();

        if (!$session) {
            return null;
        }

        // Check if user exists and is not disabled
        $user = AppUser::find($session->user_id);
        if (!$user || $user->disabled_at) {
            return null;
        }

        // Touch session if needed
        $lastSeen = $session->last_seen_at->timestamp * 1000;
        if ($now->timestamp * 1000 - $lastSeen >= self::TOUCH_EVERY_MS) {
            $session->update([
                'last_seen_at' => $now,
                'idle_expires_at' => $now->copy()->addDays(self::IDLE_DAYS),
            ]);
        }

        return $session;
    }

    /**
     * Revoke a session.
     */
    public function revokeSession(Request $request): void
    {
        $token = $this->bearer($request);
        if (!$token) {
            return;
        }

        AppSession::where('token_hash', $this->hashToken($token))
            ->update(['revoked_at' => now()]);
    }

    /**
     * Revoke all sessions for a user.
     */
    public function revokeAll(string $userId): void
    {
        AppSession::where('user_id', $userId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    /**
     * Prune expired sessions.
     */
    public function prune(int $nowMs): void
    {
        $now = now();
        AppSession::where('idle_expires_at', '<=', $now)
            ->orWhere('absolute_expires_at', '<=', $now)
            ->delete();
    }

    /**
     * Create a password reset flow.
     */
    public function createPasswordResetFlow(AppUser $user): PasswordResetFlow
    {
        $state = Str::random(43);
        $stateHash = $this->hashToken($state);

        return PasswordResetFlow::create([
            'state_hash' => $stateHash,
            'user_id' => $user->id,
            'expires_at' => now()->addMinutes(15),
        ]);
    }

    /**
     * Exchange a reset token for a ticket.
     */
    public function exchangePasswordResetToken(string $token): ?PasswordResetFlow
    {
        $tokenHash = $this->hashToken($token);

        $flow = PasswordResetFlow::where('state_hash', $tokenHash)
            ->where('expires_at', '>', now())
            ->whereNull('consumed_at')
            ->first();

        if (!$flow) {
            return null;
        }

        // Generate ticket
        $ticket = Str::random(43);
        $ticketHash = $this->hashToken($ticket);

        PasswordResetToken::create([
            'token_hash' => $ticketHash,
            'user_id' => $flow->user_id,
            'expires_at' => now()->addMinutes(15),
        ]);

        $flow->update(['consumed_at' => now()]);
        $flow->ticket = $ticket; // Attach for response

        return $flow;
    }

    /**
     * Complete password reset with ticket.
     */
    public function completePasswordReset(string $ticket, string $password): bool
    {
        $ticketHash = $this->hashToken($ticket);

        $token = PasswordResetToken::where('token_hash', $ticketHash)
            ->where('expires_at', '>', now())
            ->whereNull('consumed_at')
            ->first();

        if (!$token) {
            return false;
        }

        $user = AppUser::find($token->user_id);
        if (!$user) {
            return false;
        }

        $user->password_hash = Hash::make($password);
        $user->save();

        $token->update(['consumed_at' => now()]);

        // Revoke all sessions
        $this->revokeAll($user->id);

        return true;
    }
}