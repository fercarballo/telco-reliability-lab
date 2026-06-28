FROM nginx:alpine

# Replace the default server block with our SPA + API reverse-proxy config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets.
COPY src/ /usr/share/nginx/html/

# Runtime config generator: writes env.js from $API_BASE before nginx starts.
# The nginx image executes every script in /docker-entrypoint.d at container boot.
COPY 40-env-js.sh /docker-entrypoint.d/40-env-js.sh
RUN chmod +x /docker-entrypoint.d/40-env-js.sh

EXPOSE 80
