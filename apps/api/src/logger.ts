import pino, { type LoggerOptions, type TransportTargetOptions } from 'pino';
import { trace, isSpanContextValid } from '@opentelemetry/api';
import { config } from './config';

/**
 * Builds the structured JSON logger.
 *
 * Key design choices for the observability story:
 *  - `message` (not pino's default `msg`) and a top-level `timestamp` field, to
 *    match the documented log schema in docs/observability-guide.md.
 *  - A `mixin` that injects the *active* OpenTelemetry trace_id / span_id into
 *    every log line. This is what makes trace <-> log correlation work in
 *    Grafana (Loki derived field -> Tempo).
 *  - Optional pino-loki transport so logs land in Loki without a sidecar.
 */
export function buildLogger() {
  const targets: TransportTargetOptions[] = [];

  if (config.logging.pretty) {
    targets.push({
      target: 'pino-pretty',
      level: config.logging.level,
      options: { colorize: true, messageKey: 'message', translateTime: 'SYS:standard' },
    });
  } else {
    // Structured JSON to stdout (scraped by docker logs / collectors if desired).
    targets.push({ target: 'pino/file', level: config.logging.level, options: { destination: 1 } });
  }

  if (config.logging.lokiEnabled) {
    targets.push({
      target: 'pino-loki',
      level: config.logging.level,
      options: {
        host: config.logging.lokiUrl,
        batching: true,
        interval: 2,
        // Never let a transient Loki outage crash or stall the API.
        silenceErrors: true,
        timeout: 5000,
        labels: {
          service_name: config.serviceName,
          deployment_environment: config.deploymentEnvironment,
        },
        // Promote trace_id to a stream label so it is trivially queryable in Loki.
        propsToLabels: ['trace_id'],
      },
    });
  }

  const options: LoggerOptions = {
    level: config.logging.level,
    messageKey: 'message',
    base: {
      service: config.serviceName,
      version: config.serviceVersion,
      env: config.deploymentEnvironment,
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    // NOTE: a custom `formatters.level` is intentionally omitted — pino forbids
    // it together with `transport.targets` (it would have to run in the worker
    // thread). Levels are therefore numeric (info=30, warn=40, error=50).
    mixin() {
      const span = trace.getActiveSpan();
      if (!span) return {};
      const ctx = span.spanContext();
      if (!isSpanContextValid(ctx)) return {};
      return { trace_id: ctx.traceId, span_id: ctx.spanId };
    },
    // Never leak secrets, even if a handler accidentally logs a request.
    redact: {
      paths: [
        'password',
        '*.password',
        'req.headers.authorization',
        'req.body.password',
        'headers.authorization',
        'accessToken',
        '*.accessToken',
      ],
      censor: '[REDACTED]',
    },
    transport: { targets },
  };

  return pino(options);
}

export type AppLogger = ReturnType<typeof buildLogger>;
