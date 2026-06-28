# Deploy — demo público gratuito (slim)

Esta guía despliega el subconjunto **demostrable por navegador** del proyecto:
**API + UI web + Postgres + Redis** gestionados. La capa de observabilidad
(Prometheus, Grafana, Tempo, Loki) **no** se despliega aquí — se muestra en vivo
localmente o con los screenshots de [`docs/screenshots/`](screenshots/). Esto es
intencional: ningún tier gratuito corre 10+ contenedores 24/7, y para un demo de
portfolio lo que importa es que la API y la UI estén siempre accesibles.

> ⚠️ **Antes de exponer nada a internet**, el proyecto ya viene endurecido:
> fault injection desactivado por defecto, `JWT_SECRET` autogenerado, y un guard
> que **se niega a arrancar** en producción con un secreto de demo. No subas
> secretos al repo.

---

## Opción A — Render (recomendada, blueprint en un clic)

Render lee [`render.yaml`](../render.yaml) y aprovisiona todo automáticamente.

### Pasos

1. **Subí el repo a GitHub** (si no lo está ya).
2. En [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**.
3. Conectá el repositorio. Render detecta `render.yaml` y muestra los recursos a crear:
   `telco-db` (Postgres), `telco-redis` (Key Value), `telco-api`, `telco-web`.
4. **Apply**. Render construye las imágenes y arranca. La API corre las migraciones
   en el primer boot (`RUN_DB_MIGRATIONS=true`) → schema + 50 clientes sembrados.
5. Cuando los servicios estén *live*, copiá sus URLs (ej.
   `https://telco-api.onrender.com` y `https://telco-web.onrender.com`).
6. Completá las dos variables que quedaron pendientes (`sync: false`):
   - En **telco-api** → env var `CORS_ORIGINS` = la URL de **telco-web**.
   - En **telco-web** → env var `API_BASE` = la URL de **telco-api**.
7. **Redeploy** de ambos servicios (Render lo ofrece al guardar las env vars).
8. Abrí la URL de **telco-web** y logueate con `user_001` / `password123`.

### Qué hace cada variable

| Variable | Servicio | Propósito |
|----------|----------|-----------|
| `DEPLOYMENT_ENVIRONMENT=production` | api | Activa el guard de seguridad del secreto |
| `JWT_SECRET` (generateValue) | api | Secreto fuerte único, nunca en el repo |
| `RUN_DB_MIGRATIONS=true` | api | Crea schema + seed al arrancar (no hay initdb) |
| `FAULT_INJECTION_ENABLED=false` | api | `/admin/*` queda bloqueado públicamente |
| `OTEL_SDK_DISABLED=true` | api | Sin collector en el deploy slim |
| `REDIS_URL` (fromService) | api | URL con auth/TLS del Redis gestionado |
| `PG*` (fromDatabase) | api | Conexión al Postgres gestionado |
| `CORS_ORIGINS` | api | Permite el origen de la web (deploy cross-origin) |
| `API_BASE` | web | La SPA apunta a la API pública (genera `env.js`) |

### Limitaciones del tier gratuito de Render

- **Cold starts**: los web services gratis se duermen tras ~15 min de inactividad;
  la primera petición tras dormir tarda ~30-50 s en despertar. Aceptable para un demo.
- **Postgres gratis caduca a los ~90 días**: recreá la base (el seed se regenera solo
  al volver a desplegar gracias a `RUN_DB_MIGRATIONS`).
- Si la conexión a Postgres fallara por TLS (caso de DB externa), agregá `PGSSL=true`
  en las env vars de `telco-api`.

---

## Opción B — Fly.io (más control, sin cold starts agresivos)

Fly corre los contenedores como microVMs. Esquema equivalente:

```bash
# API (contexto = raíz del repo)
fly launch --dockerfile apps/api/Dockerfile --no-deploy --name telco-api
fly postgres create --name telco-db          # Postgres gestionado de Fly
fly postgres attach telco-db --app telco-api  # inyecta DATABASE_URL/PG*
# Redis gestionado (Upstash, integración de Fly):
fly redis create                              # te da una REDIS_URL (rediss://...)

# Setear secretos/vars de la API
fly secrets set --app telco-api \
  DEPLOYMENT_ENVIRONMENT=production \
  RUN_DB_MIGRATIONS=true \
  FAULT_INJECTION_ENABLED=false \
  OTEL_SDK_DISABLED=true \
  PGSSL=true \
  JWT_SECRET="$(openssl rand -hex 32)" \
  REDIS_URL="rediss://...desde-fly-redis..." \
  CORS_ORIGINS="https://telco-web.fly.dev"
fly deploy --app telco-api

# Web (contexto = apps/web)
fly launch --dockerfile apps/web/Dockerfile --no-deploy --name telco-web --path apps/web
fly secrets set --app telco-web API_BASE="https://telco-api.fly.dev"
fly deploy --app telco-web
```

> Fly da una asignación gratuita limitada; verificá los costos actuales antes de
> dejarlo permanente.

---

## Verificación post-deploy

```bash
API=https://telco-api.onrender.com          # ajustá a tu URL

# Liveness
curl -s $API/health/live

# Readiness (db + redis)
curl -s $API/health

# Login
curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"user_001","password":"password123"}'

# /admin debe estar BLOQUEADO en público (espera 403 disabled)
curl -s $API/admin/faults
```

Si `/health` devuelve `"database":"ok","redis":"ok"` y el login devuelve un
`accessToken`, el deploy está sano.

---

## Notas de seguridad para el deploy público

- **Datos sintéticos**: los 50 clientes y sus facturas son ficticios; las
  contraseñas (`password123`) no protegen nada real.
- **Fault injection y `/admin/*`**: desactivados (`FAULT_INJECTION_ENABLED=false`).
  No los habilites en un entorno público.
- **`JWT_SECRET`**: lo genera el proveedor; nunca está en el repositorio. El guard
  `assertProductionSafety()` impide arrancar si quedara el secreto de demo.
- **Stack de observabilidad**: no se expone. Para la demo de métrica→traza→log,
  corré el stack completo localmente (`docker compose up -d`) o usá los screenshots.
