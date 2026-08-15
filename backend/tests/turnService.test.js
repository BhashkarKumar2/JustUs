import { jest } from '@jest/globals';
import { TurnService, CREDENTIAL_TTL_SECONDS, REFRESH_AT } from '../src/services/turnService.js';

const KEY_ID = 'test-key-id';
const API_TOKEN = 'test-api-token';

// Cloudflare has returned `iceServers` both as a single object and as an array
// across endpoint versions. Both must normalize to an array.
const OBJECT_SHAPE = {
  iceServers: {
    urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp'],
    username: 'cf-user',
    credential: 'cf-secret'
  }
};

const ARRAY_SHAPE = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:turn.cloudflare.com:3478?transport=udp', username: 'cf-user', credential: 'cf-secret' }
  ]
};

const okResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload
});

describe('TurnService', () => {
  let service;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.CLOUDFLARE_TURN_KEY_ID = KEY_ID;
    process.env.CLOUDFLARE_TURN_API_TOKEN = API_TOKEN;
    service = new TurnService();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('is false when either env var is missing', () => {
      delete process.env.CLOUDFLARE_TURN_API_TOKEN;
      expect(service.isConfigured()).toBe(false);
    });

    it('is true when both env vars are present', () => {
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('normalizeIceServers', () => {
    it('wraps a single object into an array', () => {
      expect(service.normalizeIceServers(OBJECT_SHAPE)).toHaveLength(1);
    });

    it('passes an array through', () => {
      expect(service.normalizeIceServers(ARRAY_SHAPE)).toHaveLength(2);
    });

    it('drops entries without urls', () => {
      const result = service.normalizeIceServers({
        iceServers: [{ urls: 'turn:example.com' }, { username: 'no-urls' }, null]
      });
      expect(result).toEqual([{ urls: 'turn:example.com' }]);
    });

    it('returns an empty array for a missing or malformed payload', () => {
      expect(service.normalizeIceServers({})).toEqual([]);
      expect(service.normalizeIceServers(null)).toEqual([]);
    });
  });

  describe('getIceServers', () => {
    it('returns null without calling Cloudflare when not configured', async () => {
      delete process.env.CLOUDFLARE_TURN_KEY_ID;
      expect(await service.getIceServers()).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls the documented endpoint with bearer auth and a ttl', async () => {
      global.fetch.mockResolvedValue(okResponse(ARRAY_SHAPE));

      await service.getIceServers();

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`
      );
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Bearer ${API_TOKEN}`);
      expect(JSON.parse(options.body)).toEqual({ ttl: CREDENTIAL_TTL_SECONDS });
    });

    it('returns normalized servers for the object response shape', async () => {
      global.fetch.mockResolvedValue(okResponse(OBJECT_SHAPE));
      const result = await service.getIceServers();
      expect(result).toHaveLength(1);
      expect(result[0].credential).toBe('cf-secret');
    });

    it('returns null on a non-2xx response', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized'
      });

      expect(await service.getIceServers()).toBeNull();
    });

    it('returns null on a network failure', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch.mockRejectedValue(new Error('ECONNRESET'));

      expect(await service.getIceServers()).toBeNull();
    });

    it('returns null when the response contains no usable servers', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch.mockResolvedValue(okResponse({ iceServers: [] }));

      expect(await service.getIceServers()).toBeNull();
    });

    it('does not cache a failure', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch.mockRejectedValueOnce(new Error('transient'));
      global.fetch.mockResolvedValueOnce(okResponse(ARRAY_SHAPE));

      expect(await service.getIceServers()).toBeNull();
      expect(await service.getIceServers()).toHaveLength(2);
    });
  });

  describe('caching', () => {
    it('serves a second call from cache without re-fetching', async () => {
      global.fetch.mockResolvedValue(okResponse(ARRAY_SHAPE));

      const first = await service.getIceServers();
      const second = await service.getIceServers();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
    });

    it('re-fetches once the cache passes its refresh point', async () => {
      global.fetch.mockResolvedValue(okResponse(ARRAY_SHAPE));
      await service.getIceServers();

      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(Date.now() + CREDENTIAL_TTL_SECONDS * REFRESH_AT * 1000 + 1000);

      await service.getIceServers();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('de-dupes concurrent refreshes into a single request', async () => {
      global.fetch.mockResolvedValue(okResponse(ARRAY_SHAPE));

      await Promise.all([
        service.getIceServers(),
        service.getIceServers(),
        service.getIceServers()
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('clearCache forces a re-fetch', async () => {
      global.fetch.mockResolvedValue(okResponse(ARRAY_SHAPE));

      await service.getIceServers();
      service.clearCache();
      await service.getIceServers();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
