# Alabiq

Multi-service logistics platform for Saudi Arabia — Pick & Drop airport transfers,
Food Delivery, and Ecommerce (feature-flagged) from one codebase and one driver fleet.

> **⚠ Docs current as of 2026-11-19 (branch `feat/full-laravel`):** the repo root is
> now the Laravel 11 app. The old Express `backend/`, React `frontend/` (incl. mobile
> apps), and the Node realtime SSE service were removed and parked in
> [`archive/full-laravel-migration/`](archive/full-laravel-migration/) (reference for
> the Blade port; deleted in Phase 4). **Production runs on Hostinger shared hosting**
> (Apache + MariaDB), not the VPS. Realtime is pusher.com.

## Start here

| File | What it is |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **System guide** — current architecture, invariants, layout, env, commands, risks. Read first. |
| [`DEPLOYMENT-PLAN.md`](DEPLOYMENT-PLAN.md) | Production topology, shared-hosting deploy procedure, incident log |
| [`DOCKER.md`](DOCKER.md) | Docker dev stack (local) — how to run everything locally |
| [`PLAN-full-laravel.md`](PLAN-full-laravel.md) | Full-Laravel migration plan, phases, risks, addenda |

## Quick start (full local stack)

```sh
cp .env.example .env   # set APP_KEY + compose passwords (see AGENTS.md §5)
docker compose up --build
```

Open http://localhost:8080 (Blade site + `/api/*`), health at `/api/health`.

## Application code

All of it lives at the repo root: `app/` (Laravel — controllers, services, models),
`routes/`, `resources/views/` (Blade), `database/`, `config/`, plus
`docker-compose.yml` + `Dockerfile` for the local Docker stack.

## Archive

- [`archive/full-laravel-migration/`](archive/full-laravel-migration/) — old Express
  `backend/` + React `frontend/` (Blade-port reference; Phase 4 deletes)
- [`archive/README-legacy-supabase.md`](archive/README-legacy-supabase.md) — old install guide (Supabase era)
- [`archive/PROJECT-ANALYSIS-2026-10-06.md`](archive/PROJECT-ANALYSIS-2026-10-06.md) — old system analysis

All archived material is kept for history only; `AGENTS.md` is the current source of truth.
