import { trace, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api';

/**
 * Helper around custom (manual) spans for business operations. HTTP, pg and
 * redis spans are produced automatically by the auto-instrumentation; these
 * manual spans (e.g. `payment-gateway-simulator`) are what make the Tempo
 * waterfall tell a story when we inject latency into a dependency.
 */
const tracer = trace.getTracer('telco-api-business', '1.0.0');

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
