// Production-safe logging utility
// Removes all console logs in production builds

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  error: (...args) => {
    if (isDevelopment) {
      console.error(...args);
    } else {
      // In production, only log errors (can be sent to error tracking service)
      console.error(...args);
    }
  },
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};

// Override global console in production
if (!isDevelopment) {
  const noop = () => { };

  const methods = ['log', 'info', 'warn', 'debug', 'table', 'trace'];
  methods.forEach(method => {
    try {
      window.console[method] = noop;
    } catch (e) {
      // Ignore errors if console is not available
    }
  });
  // Keep console.error for production error tracking
}

export default logger;
