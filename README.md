# Alabiq

Multi-service logistics platform for Saudi Arabia — Pick & Drop airport transfers,
Food Delivery, and Ecommerce (feature-flagged) from one codebase and one driver fleet.

> **⚠ The documentation here was rewritten on 2026-11-12. The old docs described the
> pre-Docker, Supabase-based architecture and have been archived to [`archive/`](archive/).**

## Start here

| File | What it is |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **System guide** — current architecture, invariants, layout, env, commands, risks. Read first. |
| [`DEPLOYMENT-PLAN.md`](DEPLOYMENT-PLAN.md) | Production topology, cutover plan, incident log |
| [`alabiq-web-main/DOCKER.md`](alabiq-web-main/DOCKER.md) | Docker dev stack — how to run everything locally |
| [`alabiq-web-main/backend/README.md`](alabiq-web-main/backend/README.md) | Backend endpoints & auth details (partially pre-migration) |

## Quick start (full local stack)

```sh
cd alabiq-web-main
cp .env.docker.example .env
cp backend/.env.example backend/.env   # fill in SMTP + integrations
docker compose up --build
```

Open http://localhost:8080.

## Application code

All of it lives in [`alabiq-web-main/`](alabiq-web-main/):
`frontend/` (React 19 + Vite 8), `backend/` (Express 4, CommonJS), `realtime/`, `postgres/`.

## Archive

- [`archive/README-legacy-supabase.md`](archive/README-legacy-supabase.md) — old install guide (Supabase era)
- [`archive/PROJECT-ANALYSIS-2026-10-06.md`](archive/PROJECT-ANALYSIS-2026-10-06.md) — old system analysis

Both are kept for history only; `AGENTS.md` is the current source of truth.
