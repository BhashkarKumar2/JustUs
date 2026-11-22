// The deployed JustUs frontend this app wraps. Override with the JUSTUS_URL env var.
const APP_URL = process.env.JUSTUS_URL || 'https://just-us-liard.vercel.app';

module.exports = {
  APP_URL,
  APP_ORIGIN: new URL(APP_URL).origin,
  TITLEBAR_HEIGHT: 32,
  TITLEBAR_COLOR: '#0e1420',
  TITLEBAR_SYMBOL_COLOR: '#ffffff',
};
