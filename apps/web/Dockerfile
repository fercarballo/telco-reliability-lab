FROM nginx:alpine

# Replace the default server block with our SPA + API reverse-proxy config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets.
COPY src/ /usr/share/nginx/html/

EXPOSE 80
