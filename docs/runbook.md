# Telco Reliability Lab — Performance Runbook

Investigación paso a paso cuando un threshold de k6 se rompe o una alerta de p95 aparece en Grafana. Diseñado para la entrevista técnica: muestra el flujo real de diagnóstico métrica → traza → log.

---

## Señales de alerta

| Síntoma | Donde lo ves | Qué puede indicar |
|---|---|---|
| `http_req_duration{journey:payment}` p95 > 1500 ms | k6 output / Grafana RED | Latencia en payment gateway o DB |
| `http_req_failed` rate > 1% | k6 thresholds / Grafana RED | Errores 5xx, timeouts |
| `checks` rate < 99% | k6 thresholds | Respuestas inválidas, campos faltantes |
| `fault_injection_active` gauge = 1 | Grafana Reliability dashboard | Fault injection activa (puede ser intencional) |
| `http_request_errors_total` sube | Grafana RED | Inicio de degradación real |

---

## Flujo de investigación: métrica → traza → log

### Paso 1 — Confirmar el journey afectado en Grafana

1. Abrir **Telco API — RED** → panel *Latency p95 by journey*.
2. Identificar qué journey supera su SLO (línea roja en el threshold).
3. Anotar el rango temporal del pico.

### Paso 2 — Buscar una traza lenta en Tempo

1. En Grafana, ir a **Explore → Tempo**.
2. Usar TraceQL:
   ```
   { .http.route =~ "/payments.*" && duration > 1s }
   ```
   (ajustar ruta y duración según el journey afectado)
3. Abrir la traza con mayor duración.
4. Identificar el **span más lento** — típicamente `payment-gateway-simulator` o un span de DB.
5. Copiar el `trace_id` del span (visible en el panel de atributos).

### Paso 3 — Correlacionar con logs en Loki

1. Desde la traza en Tempo, usar el botón **"Logs for this span"** (enlace `tracesToLogsV2`).
   - Esto abre Loki filtrado por `trace_id="<el_id_copiado>"`.
2. O manualmente en **Explore → Loki**:
   ```logql
   {service_name="telco-api"} |= `"trace_id":"<trace_id>"`
   ```
3. Buscar en los logs:
   - `"fault injected"` → fault injection activa
   - `"payment approved"` con `duration_ms` alto → latencia real en gateway
   - `"level":50` (error) → stacktrace de la falla

### Paso 4 — Confirmar causa raíz

| Log/span encontrado | Causa probable | Acción |
|---|---|---|
| Span `payment-gateway-simulator` > 2s | Fault injection de latencia activa | `make fault-clear` o revisar `/admin/faults` |
| Span `pg.query` > 500ms | Query lenta en DB / conexiones agotadas | Revisar `pool.max` en config, EXPLAIN ANALYZE |
| HTTP 500 en logs con `"faultType":"error"` | Fault injection de error activa | `make fault-clear` |
| Timeout en span de Redis | Redis saturado o desconectado | `docker compose logs redis` |
| Sin faults, latencia creciente en soak | Memory leak / connection leak | Reiniciar API, revisar métricas de Node.js |

---

## Demo reproducible de pipeline fallido

Reproduce localmente la experiencia exacta de un PR rechazado por SLO:

```bash
# 1. Levantar el stack
make up

# 2. Ejecutar el demo de breach (inyecta fault + corre smoke con SLO thresholds)
make smoke-breach
# k6 saldrá con exit code 108 (threshold breach) — igual que en CI
# Artifact: tests/k6/reports/smoke-breach-report.html

# 3. Investigar via Grafana (http://localhost:3001)
#    - Dashboard "Telco — Reliability Degradation" → payment p95 sube a ~3s
#    - Dashboard "Telco API — RED" → error/latency spike visible

# 4. Traza en Tempo: { .http.route="/payments" && duration > 1s }
# 5. Log con el trace_id en Loki: {service_name="telco-api"} |= "fault injected"

# 6. Limpiar (ya lo hace smoke-breach automáticamente; por si acaso)
make fault-clear
```

El HTML report generado en `tests/k6/reports/smoke-breach-report.html` muestra los thresholds en rojo — evidencia de portfolio de un gate que funciona.

---

## Diagnóstico rápido de servicios

```bash
# ¿El stack responde?
curl http://localhost:3000/health | python3 -m json.tool

# ¿Hay faults activos?
curl http://localhost:3000/admin/faults | python3 -m json.tool

# ¿Prometheus scrapea la API?
curl -s 'http://localhost:9090/api/v1/query?query=up{job="telco-api"}' | python3 -m json.tool

# Logs en tiempo real de la API
docker compose logs -f api

# Verify stack completo (12 checks)
./scripts/verify-stack.sh
```

---

## SLO thresholds de referencia

| Journey | p95 objetivo | Error rate |
|---|---|---|
| Login | < 600 ms | < 1% |
| Invoice lookup | < 800 ms | < 1% |
| Plan change | < 1200 ms | < 1% |
| Payment | < 1500 ms | < 1% |
| Global p95 | < 1200 ms | — |
| Checks | > 99% | — |

Fuente: [docs/slo-definition.md](slo-definition.md)
