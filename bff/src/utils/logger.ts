import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, colorize, printf, json, errors } = winston.format;

const DEV_FORMAT = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? '\n  ' + JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')
      : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${ts} [${level}] ${message}${metaStr}${stackStr}`;
  })
);

const PROD_FORMAT = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const isDev = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: isDev ? DEV_FORMAT : PROD_FORMAT,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});
