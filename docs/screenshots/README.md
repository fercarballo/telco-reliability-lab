# Grafana Dashboard Screenshots

Capturados durante un `make smoke-breach` con fault injection activo:
**3 s de latencia forzada en 100% de pagos** → payment p95 excede el SLO de 1500 ms.

| Archivo | Dashboard | Qué muestra |
|---|---|---|
| [01-api-red.png](01-api-red.png) | Telco API — RED | p95 global = 4 s, Active faults = 1, spike de latencia en `/payments` |
| [02-k6-run.png](02-k6-run.png) | k6 Test Run | VUs, req/s, checks pass rate (rojo = 95.3% en journeys de pago), latencia por journey |
| [03-slo-overview.png](03-slo-overview.png) | SLO Overview | Payment p95 = 5 s (rojo, breach del SLO < 1500 ms); login/invoice/plan en verde |
| [04-reliability.png](04-reliability.png) | Reliability & Degradation | Active faults = 1, payment p95 = 5 s, 221 replays idempotentes, logs de traces en vivo |

## Cómo reproducir

```bash
make up          # levantar el stack
make smoke-breach  # inyecta fault + corre smoke + limpia fault + genera HTML
# Dashboards visibles en http://localhost:3001 (carpeta "Telco Reliability Lab")
```

El archivo `tests/k6/reports/smoke-breach-report.html` es el reporte HTML estático del run fallido.
