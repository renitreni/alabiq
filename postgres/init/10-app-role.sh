#!/bin/sh
set -eu

: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

cat <<SQL | psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_user="$APP_DB_USER" --set=app_password="$APP_DB_PASSWORD"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
GRANT CONNECT, CREATE ON DATABASE "$POSTGRES_DB" TO :"app_user";
GRANT ALL ON SCHEMA public TO :"app_user";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT USAGE ON SCHEMA extensions TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO :"app_user";
SQL
