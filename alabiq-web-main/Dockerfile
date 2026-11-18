# ---- Assets stage: Vite build (Tailwind + Alpine for Blade views) ----
FROM node:20-alpine AS assets
WORKDIR /assets

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY vite.config.js ./
COPY resources ./resources

# Vite writes the build to public/build (laravel-vite-plugin default)
RUN npm run build

# ---- App stage: php-fpm ----
FROM php:8.4-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \
    postgresql-dev \
    libpng-dev \
    libzip-dev \
    libxml2-dev \
    gmp-dev \
    freetype-dev \
    libjpeg-turbo-dev \
    make \
    git \
    linux-headers \
    $PHPIZE_DEPS

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_pgsql \
        bcmath \
        gd \
        zip \
        pcntl \
        gmp \
        opcache

# Install Redis extension
RUN pecl install redis \
    && docker-php-ext-enable redis

# Scrypt (App\Hashing\ScryptEngine, pure PHP, N=16384) needs headroom above the
# 128M default for password hashing, and Zend MM arena retention across
# requests makes unrecycled php-fpm workers grow — bound both.
RUN echo 'memory_limit = 256M' > /usr/local/etc/php/conf.d/alabiq-memory.ini \
    && printf '[www]\npm.max_requests = 500\n' > /usr/local/etc/php-fpm.d/zzz-alabiq.conf

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/html

# Copy composer files first for better caching
COPY composer.json composer.lock ./

# files-autoload entries (e.g. app/Support/helpers.php) must exist before
# composer install generates the autoloader
COPY app/Support/helpers.php app/Support/helpers.php

# Install PHP dependencies (skip scripts: artisan not in image yet)
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts

# Copy application code
COPY . .

# Vite build output from the assets stage
COPY --from=assets /assets/public/build ./public/build

# Re-run autoload generation so post-autoload-dump scripts (package:discover) execute
RUN composer dump-autoload --optimize --no-interaction

# Set permissions (must be before USER switch; runtime env is baked into
# config cache by the entrypoint, not here)
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 9000

USER www-data

# Cache config at container start so runtime env vars/env_file are honored
COPY --chown=www-data:www-data docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm"]
