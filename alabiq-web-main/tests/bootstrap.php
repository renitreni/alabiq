<?php

/**
 * PHPUnit bootstrap — ensures the PostgreSQL feature-test database exists
 * before Laravel boots (self-healing; migrations carry Postgres-only DDL that
 * cannot run on sqlite, so the Feature suite is pgsql-only by design).
 *
 * Dev credentials mirror docker-compose defaults; override via TEST_DB_* env.
 */

$host = getenv('TEST_DB_HOST') ?: '127.0.0.1';
$port = getenv('TEST_DB_PORT') ?: '5432';
$user = getenv('TEST_DB_USER') ?: 'alabiq';
$pass = getenv('TEST_DB_PASSWORD') ?: 'postgres123';
$name = getenv('TEST_DB_DATABASE') ?: 'alabiq_test';

if (extension_loaded('pdo_pgsql')) {
    try {
        $pdo = new PDO("pgsql:host={$host};port={$port};dbname=postgres", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $exists = $pdo->query('SELECT 1 FROM pg_database WHERE datname = ' . $pdo->quote($name))->fetchColumn();
        if (!$exists) {
            $pdo->exec('CREATE DATABASE ' . $name);
        }
        unset($pdo);
    } catch (Throwable $e) {
        fwrite(STDERR, "[tests/bootstrap] could not ensure test database {$name}: {$e->getMessage()}" . PHP_EOL);
    }
}

require __DIR__ . '/../vendor/autoload.php';
