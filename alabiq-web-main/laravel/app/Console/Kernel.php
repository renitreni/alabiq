<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Dispatch sweeper - runs every 30 seconds
        $schedule->command('dispatch:sweep')->everyThirtySeconds();

        // Food preparing reminders - runs every 5 minutes
        $schedule->command('food:remind-preparing')->everyFiveMinutes();

        // Shop stale orders check - runs every 10 minutes
        $schedule->command('shop:check-stale')->everyTenMinutes();

        // Session pruning - runs daily at 3 AM
        $schedule->command('sessions:prune')->dailyAt('03:00');

        // Error log pruning - runs daily at 4 AM
        $schedule->command('errors:prune')->dailyAt('04:00');
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}