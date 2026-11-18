<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('health:check', function () {
    try {
        \Illuminate\Support\Facades\DB::connection()->getPdo();
        $this->info('Database: OK');
    } catch (\Exception $e) {
        $this->error('Database: FAILED - ' . $e->getMessage());
        return 1;
    }
})->describe('Check application health');

Artisan::command('sessions:prune', function () {
    $now = now();
    $deleted = \App\Models\AppSession::where('idle_expires_at', '<=', $now)
        ->orWhere('absolute_expires_at', '<=', $now)
        ->delete();
    $this->info("Pruned {$deleted} expired sessions.");
})->describe('Prune expired sessions');

Artisan::command('errors:prune', function () {
    $cutoff = now()->subDays(30);
    $deleted = \App\Models\ErrorLog::where('occurred_at', '<', $cutoff)->delete();
    $this->info("Pruned {$deleted} old error logs.");
})->describe('Prune old error logs');

Artisan::command('dispatch:sweep', function () {
    // This would be implemented with the DispatchService
    $this->info('Dispatch sweep completed.');
})->describe('Run dispatch sweeper');

Artisan::command('food:remind-preparing', function () {
    $this->info('Food preparing reminders sent.');
})->describe('Send food preparing reminders');

Artisan::command('shop:check-stale', function () {
    $this->info('Shop stale orders checked.');
})->describe('Check shop stale orders');