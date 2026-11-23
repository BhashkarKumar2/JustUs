import { validateLocationMetadata, LOCATION_LIMITS } from '../src/services/locationService.js';

const NOW = new Date('2026-11-23T10:00:00Z');
const MIN = 60 * 1000;

describe('validateLocationMetadata', () => {
  test('accepts a pin and rounds coordinates to 6 decimals', () => {
    const r = validateLocationMetadata({ lat: 12.9715987654, lng: 77.5945627, accuracy: 25 }, NOW);
    expect(r.ok).toBe(true);
    expect(r.metadata.lat).toBe(12.971599);
    expect(r.metadata.lng).toBe(77.594563);
    expect(r.metadata.accuracy).toBe(25);
    expect(r.metadata.live).toBe(false);
    expect(r.metadata.updatedAt).toEqual(NOW);
  });

  test.each([
    ['latitude above 90', { lat: 91, lng: 0 }],
    ['longitude below -180', { lat: 0, lng: -181 }],
    ['string latitude', { lat: '12', lng: 0 }],
    ['NaN latitude', { lat: NaN, lng: 0 }],
    ['missing longitude', { lat: 10 }],
    ['not an object', null],
  ])('rejects %s', (_name, meta) => {
    expect(validateLocationMetadata(meta, NOW).ok).toBe(false);
  });

  test('accepts a live share ending in 15 minutes', () => {
    const until = new Date(NOW.getTime() + 15 * MIN);
    const r = validateLocationMetadata({ lat: 1, lng: 2, live: true, liveUntil: until.toISOString() }, NOW);
    expect(r.ok).toBe(true);
    expect(r.metadata.live).toBe(true);
    expect(r.metadata.liveEnded).toBe(false);
    expect(r.metadata.liveUntil).toEqual(until);
  });

  test('rejects a live share that already ended', () => {
    expect(validateLocationMetadata({ lat: 1, lng: 2, live: true, liveUntil: NOW.toISOString() }, NOW).ok).toBe(false);
  });

  test('8 hours from a client whose clock runs a little ahead is accepted and capped', () => {
    const until = new Date(NOW.getTime() + LOCATION_LIMITS.maxLiveMs + 2000);
    const r = validateLocationMetadata({ lat: 1, lng: 2, live: true, liveUntil: until }, NOW);
    expect(r.ok).toBe(true);
    expect(r.metadata.liveUntil).toEqual(new Date(NOW.getTime() + LOCATION_LIMITS.maxLiveMs));
  });

  test('rejects a live share longer than 8 hours', () => {
    const until = new Date(NOW.getTime() + LOCATION_LIMITS.maxLiveMs + 10 * MIN);
    expect(validateLocationMetadata({ lat: 1, lng: 2, live: true, liveUntil: until }, NOW).ok).toBe(false);
  });

  test('rejects a live share without an end time', () => {
    expect(validateLocationMetadata({ lat: 1, lng: 2, live: true }, NOW).ok).toBe(false);
  });
});
