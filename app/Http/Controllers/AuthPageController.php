<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Session-based login for the Blade admin portal. Uses the `web` guard so
 * it stays independent from the API's app_session guard, and verifies
 * passwords through the scrypt-compatible hasher like the API does.
 */
class AuthPageController extends Controller
{
    public function showLogin()
    {
        if (Auth::guard('web')->check()) {
            return redirect()->route('admin.dashboard');
        }

        return view('auth.login');
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (!Auth::guard('web')->attempt([
            'email' => $credentials['email'],
            'password' => $credentials['password'],
        ], $request->boolean('remember'))) {
            return back()
                ->withInput($request->only('email'))
                ->withErrors(['email' => 'These credentials do not match our records.']);
        }

        $user = Auth::guard('web')->user();

        if (!$user->isAdmin()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return back()
                ->withInput($request->only('email'))
                ->withErrors(['email' => 'This account does not have admin access.']);
        }

        if ($user->disabled_at !== null) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return back()
                ->withInput($request->only('email'))
                ->withErrors(['email' => 'This account has been disabled.']);
        }

        $request->session()->regenerate();

        // Who has been signing in — the Admins tab reads this table.
        DB::table('admin_login_events')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'profile_id' => $user->id,
            'email' => $user->email,
            'role' => $user->profile?->role ?? 'admin',
            'ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 500),
            'occurred_at' => now(),
        ]);

        return redirect()->intended(route('admin.dashboard'));
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
