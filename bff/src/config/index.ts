import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CORS_ALLOWED_ORIGINS: z.string().default('').transform(s =>
    s.split(',').map(x => x.trim()).filter(Boolean)
  ),
  ADO_API_VERSION: z.string().default('7.1'),
  ADO_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  ADO_MAX_SOCKETS: z.coerce.number().int().min(1).default(50),
  ADO_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(200),
  ADO_CONCURRENCY: z.coerce.number().int().min(1).default(8),
  CACHE_TTL_MS: z.coerce.number().int().min(0).default(30000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().min(1).default(200),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BFF_API_KEY: z.string().optional().refine(
    v => v === undefined || v.length >= 16,
    'BFF_API_KEY must be at least 16 characters'
  ),
});

export type AppConfig = z.infer<typeof configSchema>;
export const config: AppConfig = Object.freeze(configSchema.parse(process.env));
