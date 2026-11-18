<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name', 'Alabiq') }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
    <main class="text-center px-6">
        <h1 class="text-4xl font-bold tracking-tight">Alabiq</h1>
        <p class="mt-3 text-slate-400">
            Full-Laravel platform — Blade port in progress
            (see <code class="text-slate-300">PLAN-full-laravel.md</code>, Phase 3).
        </p>
    </main>
</body>
</html>
