<?php

namespace App\Services;

use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use App\Models\AppUser;

class EmailService
{
    /**
     * Send password reset email.
     */
    public function sendPasswordReset(AppUser $user): void
    {
        try {
            // Generate reset token
            $state = \Illuminate\Support\Str::random(43);
            $stateHash = hash('sha256', $state);

            \App\Models\PasswordResetFlow::create([
                'state_hash' => $stateHash,
                'user_id' => $user->id,
                'expires_at' => now()->addMinutes(15),
            ]);

            $resetUrl = config('alabiq.public_urls.web') . '/reset-password?token=' . $state;

            Mail::raw("Reset your password: {$resetUrl}\n\nThis link expires in 15 minutes.", function ($message) use ($user) {
                $message->to($user->email)
                    ->subject('Alabiq - Password Reset Request')
                    ->from(config('mail.from.address'), config('mail.from.name'));
            });
        } catch (\Exception $e) {
            Log::error('Failed to send password reset email', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}