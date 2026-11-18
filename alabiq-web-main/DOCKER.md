# Docker development stack — full Laravel

The Compose stack is now **full Laravel**: an nginx `web` container serves the
Laravel app (Blade web + `/api/*`) from `public/`, proxying PHP to the `app`
container (php-fpm). Data services (PostgreSQL, Redis, MinIO) and the standalone
Node `realtime` SSE service remain. Queue work runs in `queue-worker`
(`artisan queue:work`, Redis-backed) and recurring jobs in `scheduler`
(`artisan schedule:work`). The former Node `api`/`worker`/`frontend` services and
the React `frontend/` were removed on branch `feat/full-laravel` — the old
source is parked in `../archive/full-laravel-migration/` (reference for the
Blade port, Phase 3 of `PLAN-full-laravel.md`).

## Services

| Service | Image / build | Role |
|---|---|---|
| `postgres` | postgres:16-alpine | Data (published `5432`) |
| `redis` | redis:7-alpine | Cache, queue, GPS hot path |
| `minio` | librefs | S3-compatible object storage |
| `realtime` | `./realtime` | SSE hub (kept until Reverb) |
| `migrate` | app image, one-shot | `artisan migrate --force` |
| `seed-reference` | app image, one-shot | `db:seed --class=ReferenceDataSeeder` |
| `app` | root `Dockerfile` (multi-stage: Vite assets → php-fpm) | PHP-FPM :9000 |
| `web` | `nginx/Dockerfile` | Edge :8080 (+ host alias `127.0.0.1:4001`) |
| `queue-worker` | app image | `artisan queue:work` |
| `scheduler` | app image | `artisan schedule:work` |

## Start

```sh
cp .env.example .env
# Required: set APP_KEY (php artisan key:generate --show) and any SMTP/payment keys.
docker compose up --build
```

Open `http://localhost:8080` (Blade welcome page until the Phase 3 port) and
`http://localhost:8080/api/health`. PostgreSQL, Redis, and object files persist
in `postgres_data`, `redis_data`, `object_data`. Stop with `docker compose down`;
use `docker compose down -v` only when you intend to erase local database, Redis,
and object data.

## Tests

```sh
php artisan test          # 102 tests; Feature suite uses the albiq_test pgsql DB
```

`tests/bootstrap.php` creates `albiq_test` automatically against the compose
postgres (dev credentials; override with `TEST_DB_*` env vars). The Feature
suite cannot run on sqlite — several migrations carry Postgres-only DDL by
design.

## Migration status

Migrations live in `database/migrations/` (Laravel) and mirror the former Express
baseline (`archive/full-laravel-migration/backend/migrations/postgres/`, 0001–0012)
plus the partner/GPS deltas (000021–000024). They are driver-aware: pgsql-only
statements (partial indexes, `gen_random_uuid` defaults) are skipped on
MySQL/MariaDB for the shared-hosting target. Existing volumes built by the
Express stack were baselined (migration rows marked applied without re-running);
fresh databases run all 24 for real.

The historical SQL under `archive/full-laravel-migration/backend/migrations/reconstructed/`
is retained for reference only (Supabase-era, not part of the baseline).
