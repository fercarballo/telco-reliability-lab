# Build context is the repository ROOT (see docker-compose.yml / render.yaml),
# so the image can include both the API source and the database init SQL.
#
# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npm run build

# Prune dev dependencies for the runtime image.
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as non-root.
USER node

COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node apps/api/package.json ./
# Schema + seed SQL, read by the boot-time migration when RUN_DB_MIGRATIONS=true
# (managed-Postgres hosts that do not run docker-entrypoint-initdb.d).
COPY --chown=node:node infra/postgres/init ./db

EXPOSE 3000

# Preload OpenTelemetry auto-instrumentation before any app code is required.
ENV NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"

CMD ["node", "dist/index.js"]
