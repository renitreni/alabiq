<?php

namespace App\Http\Middleware;

use Illuminate\Auth\GuardHelpers;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Contracts\Auth\UserProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use App\Services\AppSessionsService;
use App\Models\AppUser;

class AppSessionGuard implements Guard
{
    use GuardHelpers;

    protected AppSessionsService $sessions;
    protected Request $request;

    public function __construct(UserProvider $provider, AppSessionsService $sessions, Request $request)
    {
        $this->provider = $provider;
        $this->sessions = $sessions;
        $this->request = $request;
    }

    /**
     * Get the currently authenticated user.
     */
    public function user(): ?AppUser
    {
        if ($this->user) {
            return $this->user;
        }

        $session = $this->sessions->findSession($this->request);

        if (!$session) {
            return null;
        }

        $user = $this->provider->retrieveById($session->user_id);

        if (!$user || $user->disabled_at) {
            return null;
        }

        return $this->user = $user;
    }

    /**
     * Get the ID for the currently authenticated user.
     */
    public function id(): ?string
    {
        return $this->user()?->getAuthIdentifier();
    }

    /**
     * Check if the user is authenticated.
     */
    public function check(): bool
    {
        return !is_null($this->user());
    }

    /**
     * Get the token for the current session.
     */
    public function getToken(): ?string
    {
        return $this->sessions->bearer($this->request);
    }

    /**
     * Validate a user's credentials.
     */
    public function validate(array $credentials = []): bool
    {
        return false; // Not used for token auth
    }

    /**
     * Set the current user.
     */
    public function setUser($user): static
    {
        $this->user = $user;
        return $this;
    }
}