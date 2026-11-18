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
