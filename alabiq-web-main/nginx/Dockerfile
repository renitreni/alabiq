# Alabiq web edge — nginx serving the Laravel public/ tree (index.php + Vite
# build output once the Blade port lands in Phase 3).
FROM nginx:1.27-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY public/ /var/www/html/public/
