# Alabiq web edge — nginx serving the Laravel public/ tree (index.php + Vite
# build output). Assets are built in-image (same Vite stage as the app
# Dockerfile) so the edge never depends on a host-side `npm run build`.
FROM node:20-alpine AS assets
WORKDIR /assets

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY vite.config.js ./
COPY resources ./resources

# Vite writes the build to public/build (laravel-vite-plugin default)
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY public/ /var/www/html/public/
COPY --from=assets /assets/public/build/ /var/www/html/public/build/
