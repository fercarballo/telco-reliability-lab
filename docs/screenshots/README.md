# Grafana Dashboard Screenshots

Capturados durante un `make degradation` con fault injection activo (2s de latencia en 100% de pagos → payment p95 excede el SLO de 1500 ms) más un `make load` previo para datos de tráfico base.

| Archivo | Dashboard | Qué muestra |
|---|---|---|
| [01-api-red.png](01-api-red.png) | Telco API — RED | Request rate por ruta, error rate, spike de latencia p99 en `/payments`, Business outcomes (payment approved / declined / idempotent_replay) |
| [02-slo-overview.png](02-slo-overview.png) | SLO Overview | Login/invoice/plan en verde · **Payment p95 = 3 s en rojo** (breach SLO < 1500 ms) · Error rate 0% · Synthetic availability 100% |
| [03-k6-run.png](03-k6-run.png) | k6 Test Run | VUs activos, 56 req/s, iteraciones/s, checks pass rate, latencia p95 por journey (remote-write) |
| [04-reliability.png](04-reliability.png) | Reliability & Degradation | Active faults = 0 (limpiado) · Payment p95 = 3 s (rojo) · **206 idempotent replays** · Spike de latencia antes/durante/después del fallo · Loki logs con trace_id |

## Cómo reproducir

```bash
make up          # levantar el stack
make load        # genera tráfico base (popula API RED y SLO Overview)
make degradation # inyecta fault + corre bajo carga + limpia fault + remote-write a Prometheus
# Dashboards en http://localhost:3001 (carpeta "Telco Reliability Lab")
```
