// Production-safe logging utility (backend)
//
// SECURITY + PERFORMANCE: In production we silence the verbose console methods
// (log / info / debug / trace / table). This prevents sensitive data
// (auth headers, IDs, DB connection strings, security decisions) from ever
// reaching stdout in production, and removes the synchronous stdout I/O
// overhead that ran on every request and socket event.
//
// console.error and console.warn are intentionally preserved so real
// failures remain visible to the platform (Render) log stream and can be
// forwarded to an error-tracking service.
//
// This mirrors the frontend logger (frontend/src/utils/logger.jsx).

const isProduction = process.env.NODE_ENV === 'production';

// Keep references to the real implementations for the gated logger below.
const realConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

// Gated logger for code that wants explicit, intention-revealing calls.
export const logger = {
  log: (...args) => { if (!isProduction) realConsole.log(...args); },
  info: (...args) => { if (!isProduction) realConsole.info(...args); },
  debug: (...args) => { if (!isProduction) realConsole.debug(...args); },
  warn: (...args) => realConsole.warn(...args),
  error: (...args) => realConsole.error(...args),
};

// Global override: neutralize verbose console output in production without
// having to touch hundreds of existing call sites across the codebase.
if (isProduction) {
  const noop = () => {};
  for (const method of ['log', 'info', 'debug', 'trace', 'table']) {
    // eslint-disable-next-line no-console
    console[method] = noop;
  }
  // console.error and console.warn are deliberately left intact.
}

export default logger;
