<?php

use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| Realtime events moved from the retired Node SSE service to pusher.com.
| Private-channel authorization (driver dispatch, order tracking, merchant
| dashboards) is wired here with the app_sessions web guard in Phase 3 of
| PLAN-full-laravel.md.
|
*/
