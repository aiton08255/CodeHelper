type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function log(level: LogLevel, component: string, message: string, data?: any): void {
  // @ts-ignore
  if (LOG_LEVELS[level] < LOG_LEVELS[MIN_LEVEL]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(data ? { data } : {}),
  };

  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (component: string, message: string, data?: any) => log('debug', component, message, data),
  info: (component: string, message: string, data?: any) => log('info', component, message, data),
  warn: (component: string, message: string, data?: any) => log('warn', component, message, data),
  error: (component: string, message: string, data?: any) => log('error', component, message, data),
};
