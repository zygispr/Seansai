import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/** The parts of a Fastify request/reply the serializers read. */
type LoggedRequest = { method?: string; url?: string; routeOptions?: { url?: string } };
type LoggedReply = { statusCode?: number };

/**
 * Request logs carry only method, route and status (Fastify adds `responseTime`). No IP address,
 * port, forwarded-for header or user agent is ever logged: they are personal data
 * (constitution, Quality Standards → Observability).
 */
export const loggerSerializers = {
  req: (request: LoggedRequest) => ({
    method: request.method,
    // The route pattern (e.g. `/api/v1/movies/:movieId`), not the raw URL with its parameters.
    route: request.routeOptions?.url ?? 'unmatched',
  }),
  res: (reply: LoggedReply) => ({ statusCode: reply.statusCode }),
  err: pino.stdSerializers.err,
};

type CreateLoggerOptions = {
  pretty?: boolean;
  level?: string;
  destination?: DestinationStream;
};

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const nodeEnv = process.env.NODE_ENV;
  const pretty = options.pretty ?? (nodeEnv !== 'production' && nodeEnv !== 'test');
  const loggerOptions: LoggerOptions = {
    level: options.level ?? (nodeEnv === 'test' ? 'silent' : 'info'),
    serializers: loggerSerializers,
    // Defence in depth: the serializers above never copy headers, but if a log call passes raw
    // headers anyway, credentials are still removed.
    redact: [
      'req.headers.cookie',
      'req.headers.authorization',
      'headers.cookie',
      'headers.authorization',
    ],
    // Drop `hostname`; `pid` is enough to tell processes apart.
    base: { pid: process.pid },
  };
  if (options.destination) return pino(loggerOptions, options.destination);
  if (pretty) {
    return pino({
      ...loggerOptions,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    });
  }
  return pino(loggerOptions);
}
