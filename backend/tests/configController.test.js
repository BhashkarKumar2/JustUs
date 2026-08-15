import { jest } from '@jest/globals';
import { getWebRTCConfig } from '../src/controllers/configController.js';
import turnService from '../src/services/turnService.js';

const CLOUDFLARE_RESPONSE = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: 'turn:turn.cloudflare.com:3478?transport=udp',
      username: 'cf-user',
      credential: 'cf-secret'
    }
  ]
};

const TURN_ENV_KEYS = [
  'CLOUDFLARE_TURN_KEY_ID',
  'CLOUDFLARE_TURN_API_TOKEN',
  'TURN_URL',
  'TURN_URL_TCP',
  'TURN_URL_443',
  'TURNS_URL',
  'TURN_USERNAME',
  'TURN_CREDENTIAL',
  'STUN_URL'
];

const mockRes = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });

const bodyOf = (res) => res.json.mock.calls[0][0];

describe('getWebRTCConfig', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    TURN_ENV_KEYS.forEach(key => delete process.env[key]);

    turnService.clearCache();
    global.fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    turnService.clearCache();
    jest.restoreAllMocks();
  });

  describe('tier 1: Cloudflare', () => {
    beforeEach(() => {
      process.env.CLOUDFLARE_TURN_KEY_ID = 'key-id';
      process.env.CLOUDFLARE_TURN_API_TOKEN = 'api-token';
    });

    it('serves Cloudflare credentials when the API succeeds', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => CLOUDFLARE_RESPONSE
      });

      const res = mockRes();
      await getWebRTCConfig({}, res);

      const body = bodyOf(res);
      expect(body.turnSource).toBe('cloudflare');
      expect(body.iceServers).toContainEqual(
        expect.objectContaining({ credential: 'cf-secret' })
      );
    });

    it('falls through to static TURN when the Cloudflare API fails', async () => {
      global.fetch.mockRejectedValue(new Error('cloudflare down'));
      process.env.TURN_URL = 'turn:coturn.example.com:3478';
      process.env.TURN_USERNAME = 'static-user';
      process.env.TURN_CREDENTIAL = 'static-secret';

      const res = mockRes();
      await getWebRTCConfig({}, res);

      expect(bodyOf(res).turnSource).toBe('static');
    });

    it('falls through to STUN only when Cloudflare fails and no static TURN is set', async () => {
      global.fetch.mockRejectedValue(new Error('cloudflare down'));

      const res = mockRes();
      await getWebRTCConfig({}, res);

      expect(bodyOf(res).turnSource).toBe('none');
    });
  });

  describe('tier 2: static TURN', () => {
    beforeEach(() => {
      process.env.TURN_USERNAME = 'static-user';
      process.env.TURN_CREDENTIAL = 'static-secret';
    });

    it('maps every configured TURN url onto the shared credentials', async () => {
      process.env.TURN_URL = 'turn:example.com:3478';
      process.env.TURN_URL_TCP = 'turn:example.com:3478?transport=tcp';
      process.env.TURNS_URL = 'turns:example.com:5349';

      const res = mockRes();
      await getWebRTCConfig({}, res);

      const body = bodyOf(res);
      const turnEntries = body.iceServers.filter(s => s.username === 'static-user');

      expect(turnEntries).toHaveLength(3);
      turnEntries.forEach(entry => expect(entry.credential).toBe('static-secret'));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('ignores static TURN when credentials are set but no urls are', async () => {
      const res = mockRes();
      await getWebRTCConfig({}, res);

      expect(bodyOf(res).turnSource).toBe('none');
    });

    it('ignores static TURN urls when credentials are missing', async () => {
      delete process.env.TURN_USERNAME;
      process.env.TURN_URL = 'turn:example.com:3478';

      const res = mockRes();
      await getWebRTCConfig({}, res);

      expect(bodyOf(res).turnSource).toBe('none');
      expect(bodyOf(res).iceServers).toHaveLength(1);
    });
  });

  describe('tier 3: STUN only', () => {
    it('responds 200 with a usable config when nothing is configured', async () => {
      const res = mockRes();
      await getWebRTCConfig({}, res);

      const body = bodyOf(res);
      expect(res.status).not.toHaveBeenCalled();
      expect(body.turnSource).toBe('none');
      expect(body.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    });

    it('warns server-side when no TURN provider is available', async () => {
      await getWebRTCConfig({}, mockRes());
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('common response fields', () => {
    it('always leads with the STUN server and honours STUN_URL', async () => {
      process.env.STUN_URL = 'stun:custom.example.com:3478';

      const res = mockRes();
      await getWebRTCConfig({}, res);

      expect(bodyOf(res).iceServers[0]).toEqual({ urls: 'stun:custom.example.com:3478' });
    });

    it('sets iceCandidatePoolSize', async () => {
      const res = mockRes();
      await getWebRTCConfig({}, res);

      expect(bodyOf(res).iceCandidatePoolSize).toBe(10);
    });
  });
});
