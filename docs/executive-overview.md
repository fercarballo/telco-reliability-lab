# Telco Reliability Lab — Resumen Ejecutivo

**Audiencia:** Managers de IT, responsables de contratación, stakeholders no técnicos
**Propósito:** Qué es este proyecto, qué problema resuelve y qué demuestra

---

## ¿Qué es este proyecto?

El **Telco Reliability Lab** es un sistema completo de aseguramiento de calidad y pruebas de fiabilidad construido para simular cómo una empresa de telecomunicaciones real protege sus operaciones más críticas orientadas al cliente.

Fue construido desde cero como demostración en portfolio de habilidades de ingeniería QA y fiabilidad de nivel senior — el tipo de trabajo que normalmente se realiza dentro de una organización de ingeniería madura.

---

## ¿Qué problema resuelve?

Las empresas de telecomunicaciones procesan millones de eventos de facturación, cambios de plan y solicitudes de servicio cada día. Cuando esos sistemas fallan — o se comportan incorrectamente bajo carga — las consecuencias son directas y costosas:

- **Un sistema de facturación que cobra dos veces** erosiona la confianza y genera contracargos.
- **Una pasarela de pago lenta** hace que los clientes abandonen antes de completar una transacción.
- **Un sistema que falla silenciosamente** significa que el equipo de ingeniería se entera por clientes enfadados, no por el monitoreo.
- **Una regresión introducida en un nuevo despliegue** puede pasar desapercibida hasta después del horario laboral.

Este laboratorio demuestra que todos esos modos de fallo se detectan **antes** de llegar a producción — y que cuando algo va mal, el equipo tiene las herramientas para encontrarlo y corregirlo en minutos, no en horas.

---

## ¿Qué se construyó?

El proyecto contiene seis capas interconectadas:

### 1. Un servicio API realista
Una API de gestión de facturación y cuentas funcional — el mismo tipo de servicio que se encuentra en los back-ends reales de operadoras telco. Los clientes pueden autenticarse, ver facturas, pagarlas y solicitar cambios de plan.

### 2. Inyección de fallos
La capacidad de romper el sistema de forma controlada — simulando timeouts de pasarela de pago, errores del servicio de facturación y fallos en cascada — para verificar que el monitoreo los detecta y el sistema se recupera correctamente.

### 3. Pruebas de carga de rendimiento
Scripts automatizados que simulan cientos de usuarios concurrentes realizando todos los flujos de negocio simultáneamente, midiendo la velocidad de respuesta del sistema y el número de errores que produce bajo tráfico realista.

### 4. Stack de observabilidad completo
Un dashboard de monitoreo (Grafana) conectado a cuatro fuentes de datos:
- **Métricas** — números de rendimiento en tiempo real (tiempos de respuesta, tasas de error, volumen de pagos).
- **Logs** — un registro estructurado de cada petición con contexto para depuración.
- **Trazas** — un mapa paso a paso de cómo cada petición se movió a través del sistema, incluyendo consultas a base de datos y llamadas externas.
- **Alertas** — notificaciones automáticas cuando los indicadores clave superan los umbrales definidos.

### 5. Validación de seguridad
Escaneos automatizados (OWASP ZAP) que prueban la API en busca de vulnerabilidades web comunes — garantizando que no se introduzcan regresiones de seguridad entre versiones.

### 6. Pipeline CI/CD automatizado
Cada cambio de código ejecuta automáticamente la suite de pruebas completa — tests de integración, pruebas de carga, escaneos de seguridad y validación de especificación OpenAPI — antes de que nada llegue a un entorno similar a producción.

---

## ¿Qué riesgos detecta?

| Riesgo | Cómo se detecta |
|--------|-----------------|
| Pago procesado dos veces (cargo duplicado) | Guard de idempotencia en DB + tests de replay en API y pruebas de carga |
| Cliente A accediendo a los datos del cliente B | Guard de autorización cross-customer — probado con assertions 403 en cada ruta |
| Pasarela de pago lenta bajo carga | SLOs de latencia por journey con umbrales p95 en Grafana |
| Aumento silencioso de tasa de error tras despliegue | Las alertas de Prometheus se disparan cuando la tasa de error supera el 1% |
| Cambio incompatible en el contrato de la API | La especificación OpenAPI 3.1 se valida en cada ejecución de CI |
| Vulnerabilidades de seguridad web comunes | Escaneo automatizado OWASP ZAP en el pipeline |
| Facturas consumidas entre ejecuciones de prueba | Endpoint de reset admin — se ejecuta automáticamente antes de cada prueba de carga |

---

## ¿Qué significa "listo para producción" aquí?

Este es un entorno de laboratorio — se ejecuta en un portátil de desarrollo usando Docker. Pero cada decisión técnica se tomó como se haría en un sistema real de producción:

- **Sin mocks de base de datos en los tests** — las pruebas acceden a una instancia PostgreSQL real, por lo que los bugs SQL emergen en lugar de quedar ocultos detrás de respuestas simuladas.
- **Idempotencia aplicada a nivel de base de datos** — la restricción `UNIQUE(idempotency_key)` garantiza que los pagos duplicados concurrentes sean rechazados incluso si dos peticiones llegan simultáneamente.
- **Los secretos son variables de entorno** — sin credenciales en el código fuente; el pipeline de CI las inyecta en tiempo de ejecución.
- **La observabilidad está conectada de extremo a extremo** — una única consulta lenta a base de datos aparece en Grafana Tempo como un span visible, haciendo el análisis de causa raíz rápido y preciso.
- **Las alertas se enrutan a través de la API** — Prometheus dispara → Alertmanager enruta → la API lo registra vía pino → Loki lo almacena — toda la cadena de alertas es demostrable.

---

## Números clave

| Métrica | Valor |
|---------|-------|
| Rutas API cubiertas por tests de integración | 100% |
| Escenarios de prueba automatizados en CI | 21 |
| Journeys de negocio ejercitados bajo carga | 4 (login, consulta facturas, cambio de plan, pago) |
| Señales de observabilidad recopiladas | 4 (métricas, logs, trazas, alertas) |
| Hallazgos de OWASP ZAP que bloquean despliegue | 0 |
| Tiempo para detectar una regresión de latencia | < 30 segundos (intervalo de scrape de Prometheus) |

---

## Cómo verlo en funcionamiento

```bash
# Levantar todo el stack (API, base de datos, monitoreo)
docker compose up -d

# Ejecutar todos los tests de integración
npx playwright test tests/api/

# Ejecutar la prueba de carga
make smoke

# Abrir los dashboards
open http://localhost:3001   # Grafana (admin / admin)

# Inyectar un fallo y observarlo en el dashboard en tiempo real
curl -X POST http://localhost:3000/admin/faults \
  -H 'Content-Type: application/json' \
  -d '{"target":"payments","fault":"latency","rate":1.0,"latencyMs":2000,"durationSec":120}'

# Limpiar el fallo
make fault-clear
```

Todo lo necesario para demostrar este sistema desde cero está documentado en el [README principal](../README.md) y en la [guía de entrevista técnica](interview-walkthrough.md).

---

## Por qué importa en una entrevista

Este proyecto responde las preguntas más difíciles de entrevista con código funcional en lugar de afirmaciones verbales:

- *"¿Cómo pruebas la idempotencia de pagos?"* → `tests/api/payments.spec.ts` línea 73 — el test de replay se ejecuta en vivo.
- *"¿Cómo detectas regresiones de rendimiento?"* → Los umbrales de k6 se incumplen → la alerta de Grafana se dispara — demostrable en menos de 2 minutos.
- *"¿Cómo enfocas la observabilidad?"* → Abrir un dashboard de Grafana y trazar un pago específico de extremo a extremo a través de métricas, logs y spans.
- *"¿Cómo gestionas la tolerancia a fallos?"* → Inyectar un timeout en la pasarela de pago, observar la tasa de error subir en tiempo real, limpiar el fallo, observar la recuperación.
- *"¿Cómo evitas cobrar dos veces a un cliente?"* → La restricción `UNIQUE(idempotency_key)` en PostgreSQL + guard de `InvoiceStatus.PAID` antes de llamar al gateway — dos líneas de defensa probadas con tests automáticos.
