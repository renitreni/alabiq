# Docker development stack

The Compose stack builds the Vite frontend, Express API, standalone PostgreSQL, Redis, MinIO object
storage, and the application realtime service. Redis and MinIO are private to the Compose network;
browser event streams remain on the API's `/api/events` endpoint, which authorizes each topic before
opening an internal stream.

## Start

```sh
cp .env.docker.example .env
cp backend/.env.example backend/.env
# Fill in the backend's SMTP and still-used integrations in backend/.env.
docker compose up --build
```

Open `http://localhost:8080`. PostgreSQL, Redis, and object files are persisted in `postgres_data`,
`redis_data`, and `object_data`. Stop with `docker compose down`; use `docker compose down -v` only
when you intend to erase local database, Redis, and object data.

## Migration status

The deployment is fully self-contained: no Supabase service, key, or SDK is
involved anywhere in the stack. Realtime broadcasts and subscriptions use the
dedicated `realtime` container and Redis. The PostgreSQL container runs the
tracked baseline migrations and safe reference-data seed on startup. Signup,
login, sessions, password recovery, profile sync, account deletion, all
business data (rides, food, shop, ledger, tracking), and the admin dashboards
are served by the API against PostgreSQL. Files live in MinIO through the
S3-compatible adapter, and SMTP delivers password-reset mail (`SMTP_HOST`,
`MAIL_FROM`, and optional SMTP credentials in `backend/.env`).

Existing production data is not imported by these fresh-install baseline
migrations — a production cutover needs its own data-migration step.

The historical SQL under `backend/migrations/reconstructed/` is retained for
reference only; it was written against Supabase Auth and is not part of the
tracked baseline. The standalone baseline is under `backend/migrations/postgres/`.
