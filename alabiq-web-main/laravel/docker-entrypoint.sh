#!/bin/sh
set -e

# Bake runtime configuration (env vars / env_file are available here,
# unlike during the image build)
php artisan config:cache || true
php artisan route:cache || true
# no view:cache — API-only app has no resources/views directory

exec "$@"
