#!/bin/sh
# Generate the runtime config consumed by index.html → app.js.
# API_BASE is empty for same-origin/local deploys (SPA falls back to '/api' and
# nginx reverse-proxies). A split cloud deploy sets API_BASE to the API origin.
# The nginx image runs every executable script in /docker-entrypoint.d before
# starting nginx, so env.js exists before the first request is served.
set -e
echo "window.API_BASE=\"${API_BASE:-}\";" > /usr/share/nginx/html/env.js
echo "env.js generated with API_BASE='${API_BASE:-}'"
