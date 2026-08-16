/**
 * TURN Credential Service
 *
 * Mints short-lived ICE server credentials from Cloudflare Realtime TURN.
 *
 * Cloudflare issues a long-lived "TURN key" (id + API token) which is used
 * server-side to generate ephemeral credentials for clients. The long-lived
 * key must never reach the browser.
 *
 * Credentials are not user-scoped, so a single set is cached and shared across
 * all callers until it approaches expiry. This keeps call setup from paying a
 * Cloudflare round-trip on every call.
 */

const CLOUDFLARE_API_BASE = 'https://rtc.live.cloudflare.com/v1/turn/keys';

// How long Cloudflare should keep issued credentials valid.
// Comfortably longer than any single call, short enough to limit exposure.
const CREDENTIAL_TTL_SECONDS = 2 * 60 * 60; // 2 hours

// Refresh once 80% of the lifetime has elapsed, so an in-flight call never
// starts with credentials that are about to expire.
const REFRESH_AT = 0.8;

const REQUEST_TIMEOUT_MS = 5000;

class TurnService {
  constructor() {
    this.cached = null;      // { iceServers, expiresAt }
    this.inFlight = null;    // de-dupes concurrent refreshes
  }

  /**
   * True when both Cloudflare env vars are present.
   */
  isConfigured() {
    return Boolean(
      process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN
    );
  }

  /**
   * Cloudflare's response shape has varied across endpoint versions: some
   * return `iceServers` as a single object, others as an array. Normalize to
   * an array and drop anything without a `urls` field.
   */
  normalizeIceServers(payload) {
    const raw = payload?.iceServers;
    if (!raw) return [];

    const list = Array.isArray(raw) ? raw : [raw];
    return list.filter(server => server && server.urls);
  }

  /**
   * Returns cached credentials if they are still comfortably valid.
   */
  getCached() {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.iceServers;
    }
    return null;
  }

  /**
   * Fetch fresh credentials from Cloudflare.
   * Throws on any non-2xx response or network failure - the caller decides
   * how to degrade.
   */
  async fetchFromCloudflare() {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${CLOUDFLARE_API_BASE}/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        // Body may hold Cloudflare's error detail; it must never be sent to
        // the client, but it is worth logging.
        const detail = await response.text().catch(() => '');
        throw new Error(
          `Cloudflare TURN API returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
        );
      }

      const payload = await response.json();
      const iceServers = this.normalizeIceServers(payload);

      if (iceServers.length === 0) {
        throw new Error('Cloudflare TURN API returned no usable iceServers');
      }

      return iceServers;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Main entry point. Returns an array of ICE servers, or null if Cloudflare
   * is not configured or the request failed. Never throws.
   */
  async getIceServers() {
    if (!this.isConfigured()) return null;

    const cached = this.getCached();
    if (cached) return cached;

    // If a refresh is already running, wait on it rather than firing a second.
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      try {
        const iceServers = await this.fetchFromCloudflare();

        this.cached = {
          iceServers,
          expiresAt: Date.now() + CREDENTIAL_TTL_SECONDS * REFRESH_AT * 1000
        };

        return iceServers;
      } catch (error) {
        console.error('[turn] Cloudflare credential fetch failed:', error.message);
        return null;
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  /**
   * Test hook - drops cached credentials.
   */
  clearCache() {
    this.cached = null;
    this.inFlight = null;
  }
}

export default new TurnService();
export { TurnService, CREDENTIAL_TTL_SECONDS, REFRESH_AT };
