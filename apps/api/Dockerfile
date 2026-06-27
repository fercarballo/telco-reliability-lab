# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
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
COPY --chown=node:node package.json ./

EXPOSE 3000

# Preload OpenTelemetry auto-instrumentation before any app code is required.
ENV NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"

CMD ["node", "dist/index.js"]
