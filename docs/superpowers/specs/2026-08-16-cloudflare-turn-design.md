# Cloudflare TURN for WebRTC Calling

Date: 2026-08-16
Branch: `feat/cloudflare-turn` (from `main`)

## Problem

JustUs already has working WebRTC voice and video calling: `useWebRTC.jsx` drives
the peer connection, `socketHandler.js` relays signaling, and
`GET /api/config/webrtc` serves ICE servers from environment variables.

The ICE configuration has never been populated. `TURN_URL`, `TURN_USERNAME`, and
`TURN_CREDENTIAL` are absent from `.env.example` and unset in deployment, so the
old controller returned HTTP 500. The frontend caught that error and silently
fell back to a STUN-only configuration.

STUN-only calling works when at least one peer is directly reachable. It fails
when both peers sit behind restrictive NAT — most commonly when one is on mobile
data, where carrier-grade NAT blocks inbound connections entirely. The failure is
silent: the call rings, connects, and then produces no media.

TURN fixes this by relaying media through a public server when a direct path
cannot be negotiated. Roughly 10–20% of real-world calls need it.

## Approach

Use Cloudflare Realtime TURN rather than self-hosting coturn.

Self-hosting requires a VPS with a public static IP and raw UDP — which Render
cannot provide, since it forwards a single HTTP port per service. That means a
second piece of infrastructure to run and pay for. Cloudflare's free tier covers
1,000 GB/month, which at roughly 1.35 GB per relayed video call-hour is far
beyond this app's volume, and it includes the TLS-on-443 endpoint that gets calls
through corporate firewalls.

Cloudflare issues a long-lived TURN key. The backend exchanges it for
short-lived client credentials via
`POST https://rtc.live.cloudflare.com/v1/turn/keys/{id}/credentials/generate-ice-servers`.
The long-lived key stays server-side.

## Design

### Resolution chain

`GET /api/config/webrtc` resolves ICE servers in priority order:

1. **Cloudflare** — ephemeral credentials minted through the API.
2. **Static TURN** — `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` from the
   environment. Retained so a self-hosted coturn can be swapped in without a
   code change.
3. **STUN only** — always a valid configuration, just without relay capability.

The response includes a `turnSource` field (`cloudflare` | `static` | `none`) so
the active tier is visible in devtools without server access.

### The endpoint no longer returns 500

Previously a missing TURN configuration produced a 500, which the frontend
swallowed into a silent STUN-only fallback. Degraded calling is a real outcome
and should be visible, not an error the client hides. The endpoint now always
returns 200 with the best configuration available, and logs a warning
server-side when no TURN provider is configured.

### Credentials are fetched per call, not per mount

`useWebRTC.jsx` previously fetched ICE config once when the hook mounted. That
does not work with time-limited credentials: a chat page left open longer than
the credential TTL would hand `RTCPeerConnection` expired credentials, and the
call would fail to relay.

The fetch moves to the top of `startCall()` and `answerCall()`.

This also removes an existing latent crash. `createPeerConnection()` returned
`null` when the mount-time fetch had not yet resolved, and the following line
dereferenced it (`pc.addTrack`). Starting a call immediately on page load threw
a `TypeError`. With the fetch awaited inline, the config is always present and
`createPeerConnection(rtcConfig)` takes it as an argument.

### Caching

TURN credentials are not user-scoped, so one set is shared across all callers.
`turnService` caches them in memory and refreshes at 80% of the 2-hour TTL,
which keeps call setup off the Cloudflare round-trip. Concurrent refreshes are
de-duplicated into a single in-flight request. Failures are never cached.

### Response normalization

Cloudflare's `iceServers` field has appeared both as a single object and as an
array across endpoint versions. `normalizeIceServers()` accepts either, wraps to
an array, and drops entries without a `urls` field. This was written against the
documented request contract; the response shape has not been verified against a
live key.

## Files

| File | Change |
|---|---|
| `backend/src/services/turnService.js` | New. Cloudflare credential minting, normalization, caching. |
| `backend/src/controllers/configController.js` | Rewritten for the three-tier chain; always 200. |
| `backend/tests/turnService.test.js` | New. Mocked-fetch coverage of both response shapes, all failure modes, and cache behavior. |
| `frontend/src/hooks/useWebRTC.jsx` | Config fetched per call; `createPeerConnection` takes config as a parameter. |
| `frontend/src/services/config.jsx` | Fallback tagged `turnSource: 'unreachable'`. |
| `backend/.env.example` | Documents the Cloudflare and static TURN variables. |

### Note on the test file

The root `.gitignore` excludes `backend/tests/` (line 23), which is why jest is
configured with `testMatch: **/tests/**/*.test.js` but the repo contains no
backend tests. The new test was force-added so it is reviewable and runnable in
CI. Removing that `.gitignore` line would make backend tests tracked by default;
leaving it means future test files need the same override.

## Deployment

Set on the Render backend service (`justus-9hwt.onrender.com`):

- `CLOUDFLARE_TURN_KEY_ID`
- `CLOUDFLARE_TURN_API_TOKEN`

The Render CLI (v2.21) has no environment-variable subcommand, so these must be
set through the dashboard or the Render REST API.

Without them the app behaves exactly as it does today — STUN-only, with a
server-side warning — so deploying this branch before creating the key is safe.

## Verification

Unit tests cover the tier selection and cache logic. End-to-end verification
requires a real Cloudflare key and two devices on different networks:

1. Confirm `GET /api/config/webrtc` returns `turnSource: "cloudflare"`.
2. Place a call between a device on mobile data and a device on Wi-Fi. Carrier
   NAT forces the relay path, so this is the only configuration that actually
   exercises TURN — two browser tabs on one machine connect directly and never
   touch it.
3. In `chrome://webrtc-internals`, confirm the selected candidate pair has type
   `relay`.

## Out of scope

Group calling, call recording, and the unrelated issues in `useWebRTC.jsx`
(`answerCall` sets state to `connected` before the connection is established;
verbose logging). Not addressed here.
