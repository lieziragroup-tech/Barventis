import * as Sentry from "@sentry/react";

export const logger = {
  info: (...args) => {
    if (import.meta.env.DEV) console.log('[INFO]', ...args);
  },
  warn: (...args) => {
    console.warn('[WARN]', ...args);
    if (!import.meta.env.DEV) {
      Sentry.captureMessage(args.join(' '), 'warning');
    }
  },
  error: (...args) => {
    console.error('[ERROR]', ...args);
    if (!import.meta.env.DEV) {
      if (args[0] instanceof Error) {
        Sentry.captureException(args[0], { extra: { context: args.slice(1) } });
      } else {
        Sentry.captureMessage(args.join(' '), 'error');
      }
    }
  },
};
