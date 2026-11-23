# Location Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can send a one-time location pin or a live location (15 min / 1 h / 8 h) in DMs and groups, rendered as a small map bubble, in the web app and the Windows desktop app.

**Architecture:** A location is a normal `Message` with `type: 'location'` and coordinates in `metadata`. Live shares are the same message, updated in place by the sender's `location.update` socket events and ended by `location.stop`, delete, or a server-side expiry sweep; the server rebroadcasts `location.updated` to the DM's two user rooms or the group room. The frontend renders one shared `LocationMessage` component (Leaflet + OpenStreetMap, lazy-loaded) in both chat views.

**Tech Stack:** Express + Socket.IO + Mongoose (backend, Jest), React 18 + Vite (frontend), Leaflet 1.9 + OSM tiles, Electron 45 shell.

**Spec:** `docs/superpowers/specs/2026-11-23-location-sharing-design.md`

## Global Constraints

- Message type string: `location`. Metadata: `{ lat, lng, accuracy, live, liveUntil, liveEnded, updatedAt }`; lat/lng rounded to 6 decimals.
- Validation: lat in −90..90, lng in −180..180 (numbers, finite); live `liveUntil` must be in the future and ≤ 8 h from now.
- Durations offered: 15 min, 1 h, 8 h.
- Client sends live updates at most every 15 s, and only when moved ≥ 20 m or ≥ 60 s since the last sent update.
- Server accepts at most 1 `location.update` per 5 s per message (extra ones dropped silently); updates don't count against the chat-message rate limit.
- `content` fallback strings: `📍 Location` (pin), `📍 Live location` (live). Notification/reply label: `📍 Location` / `📍 Live location` / reply preview `Location`.
- Bubble captions: pin `📍 Location` (+ `± N m` when accuracy > 100 m); live `🟢 Live · until <h:mm AM/PM> · updated <relative>`; ended `Live location ended`. Sender sees `Stop sharing` button on an active live share.
- Tap target: `https://www.google.com/maps?q=<lat>,<lng>` in a new tab.
- One live share per sender per chat: starting a new one ends the previous one.
- Expiry sweep every 60 s ends overdue live shares.
- Desktop: add `geolocation` to `ALLOWED_PERMISSIONS`; installer must be rebuilt.
- Unsupported desktop geolocation copy: `Location isn't available in the desktop app yet — use the website on your phone`.
- Permission/fix failure toast: `Location is off — enable it in your browser / Windows settings`.

## Review Focus

1. **Sender opens the chat in two tabs/devices** → only one watcher sends updates for a live share (the device that started it, or the one that resumed it); the other shows `Stop sharing` and stopping from either works. Test owned by Task 4 (`acquireLiveLock` tests).
2. **Clock skew / receiver's stale view** → when `liveUntil` passes on the receiver's clock before the server's `location.updated` arrives, the bubble shows `Live location ended` locally anyway. Test in Task 5 (`renders ended when liveUntil is past even if liveEnded is false`).
3. **A non-participant sends `location.update`/`location.stop` with a valid messageId** → ignored; nothing broadcast. Test in Task 2.
4. **Garbage coordinates from a hostile client** (strings, NaN, out of range, missing) on send and on update → rejected, message not created / not updated. Test in Tasks 1 and 2.
5. **Delete-for-me on a live location by the receiver** → it disappears for them, but the share keeps running for others; future `location.updated` events for a message the receiver hid must not resurrect it in their view. Test in Task 5 (`ignores updates for messages not in the list`).

---

### Task 1: Spike — does Electron 45 geolocation work on Windows? + desktop permission

Do this first; its result decides Task 6's desktop branch.

**Files:**
- Modify: `desktop/src/main.js` (`ALLOWED_PERMISSIONS`, ~line 17)
- Create (throwaway, not committed): scratch Electron page calling `navigator.geolocation.getCurrentPosition`

**Interfaces:**
- Produces: a recorded result in the plan's PR description: `desktopGeolocation: works | fails (<error code/message>)`. Task 6 reads it.

- [ ] **Step 1:** Add `'geolocation'` to `ALLOWED_PERMISSIONS`.
- [ ] **Step 2:** Run the shell against a local page that calls `getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })` with Windows Location ON; record success (coords + accuracy) or the error code.
- [ ] **Step 3:** Repeat with Windows Location OFF; record the error (expected: `PERMISSION_DENIED` or `POSITION_UNAVAILABLE`).
- [ ] **Step 4:** Commit the permission change only:
```bash
git add desktop/src/main.js
git commit -m "feat(desktop): allow geolocation for the JustUs origin"
```

### Task 2: Backend — location validation and send

**Files:**
- Create: `backend/src/services/locationService.js`
- Modify: `backend/src/websocket/socketHandler.js` (`chat.send` ~line 290, `group.send` ~line 710)
- Test: `backend/tests/locationService.test.js`

**Interfaces:**
- Produces: `validateLocationMetadata(meta: object, now?: Date) -> { ok: true, metadata: object } | { ok: false, error: string }` — normalizes (6-decimal rounding, `live` boolean, `liveEnded: false`, `updatedAt: now`, `liveUntil` as Date). `LOCATION_LIMITS = { maxLiveMs: 8*3600e3 }`.

- [ ] **Step 1: Failing tests** — `validateLocationMetadata`:
  - accepts `{lat: 12.9715987654, lng: 77.5945627, accuracy: 25}` → `metadata.lat === 12.971599`, `live === false`.
  - rejects `lat: 91`, `lng: -181`, `lat: '12'`, `lat: NaN`, missing `lng`.
  - live: accepts `liveUntil = now + 15 min`; rejects `liveUntil <= now` and `> now + 8 h`.
- [ ] **Step 2:** `cd backend && npm test -- locationService` → FAIL (module missing).
- [ ] **Step 3:** Implement `validateLocationMetadata`. In `chat.send` and `group.send`: when `incoming.type === 'location'`, validate; on failure `socket.emit('error', { message: 'Invalid location' })` and return; on success use the normalized metadata and force `content` to the fallback string. If `live`, end the sender's previous active live share in the same conversation/group (set `liveEnded`, emit `location.updated` for it — use Task 3's `endLiveShare`; until Task 3 lands, a direct update is fine and gets replaced).
- [ ] **Step 4:** `npm test -- locationService` → PASS.
- [ ] **Step 5:** Commit `feat(backend): validate and store location messages`.

### Task 3: Backend — live updates, stop, delete, expiry sweep

**Files:**
- Modify: `backend/src/services/locationService.js`, `backend/src/websocket/socketHandler.js` (new handlers; `chat.delete` and `group.delete` end live shares), `backend/src/server.js` (start sweep after `configureSocketIO`)
- Modify: `backend/package.json` devDependencies: `mongodb-memory-server@^10`, `socket.io-client@^4.8`
- Test: `backend/tests/location.integration.test.js` (real server module on an ephemeral port + in-memory MongoDB + socket clients, pattern from PR #6's verification)

**Interfaces:**
- Consumes: `validateLocationMetadata` (Task 2).
- Produces (socket events):
  - client→server `location.update { messageId, lat, lng, accuracy }`
  - client→server `location.stop { messageId }`
  - server→client `location.updated { id, conversationId?, groupId?, metadata }` (same shape for move, stop, expiry)
- Produces (service): `applyLocationUpdate(message, {lat,lng,accuracy}, userId, now) -> 'updated'|'ignored'|'ended'`, `endLiveShare(message, now) -> message`, `startLocationSweep(io, intervalMs = 60000) -> stop()`, `emitLocationUpdated(io, message)`.

- [ ] **Step 1: Failing integration tests** (`location.integration.test.js`):
  - DM live share: sender's `location.update` → receiver and sender get `location.updated` with new lat/lng; stored message updated.
  - second update within 5 s is dropped (no second event).
  - non-sender participant and non-participant `location.update`/`location.stop` → no event, message unchanged.
  - `location.stop` by sender → `liveEnded: true` broadcast; later updates ignored.
  - update after `liveUntil` → treated as ended (`liveEnded: true` broadcast once).
  - sweep (`startLocationSweep(io, 200)`) ends an overdue share with no client involvement.
  - delete for everyone on a live share → `messages.deleted` and the share is ended (updates ignored).
  - group live share: member gets `location.updated` without `group.join`; removed member does not.
  - starting a second live share in the same chat ends the first.
  - invalid coordinates in `location.update` (`lat: 'x'`, `lat: 200`) ignored.
- [ ] **Step 2:** `npm test -- location.integration` → FAIL.
- [ ] **Step 3:** Implement the service functions, the two handlers (per-socket `Map<messageId, lastAcceptedMs>` for the 5 s limit), the delete hooks, and the sweep (query `type: 'location', 'metadata.live': true, 'metadata.liveEnded': {$ne: true}, 'metadata.liveUntil': {$lte: now}`).
- [ ] **Step 4:** `npm test` → all backend tests PASS (existing two suites included).
- [ ] **Step 5:** Commit `feat(backend): live location updates, stop, expiry`.

### Task 4: Frontend — location helpers and the sharing hook

**Files:**
- Create: `frontend/src/utils/location.js`, `frontend/src/utils/location.test.mjs`
- Create: `frontend/src/hooks/useLocationSharing.jsx`
- Modify: `frontend/package.json` `test` script to also run `src/utils/location.test.mjs`

**Interfaces:**
- Produces (`utils/location.js`, pure):
  - `distanceMeters(a: {lat,lng}, b: {lat,lng}) -> number` (haversine)
  - `shouldSendUpdate(last: {lat,lng,t}|null, next: {lat,lng,t}) -> boolean` (≥15 s since last AND (≥20 m OR ≥60 s); `last === null` → true)
  - `mapsUrl(lat, lng) -> string`
  - `liveStatus(metadata, now: Date) -> 'pin'|'live'|'ended'`
  - `formatLiveCaption(metadata, now: Date) -> string` (exact copy from Global Constraints)
  - `geolocationErrorMessage(err) -> string`
  - `acquireLiveLock(storage: Storage-like, messageId: string, tabId: string, now: number) -> boolean` — key `justus.liveLock.<messageId>`, value `{tabId, t}`; true if free, stale (> 30 s old) or already ours (then refreshes `t`)
- Produces (hook): `useLocationSharing({ socket, user, chat: { kind: 'dm'|'group', receiverId?, conversationId?, groupId? }, messages }) -> { sendCurrentLocation(): Promise<void>, startLiveLocation(durationMs: number): Promise<void>, stopLiveLocation(messageId: string): void, supported: boolean, busy: boolean }`

- [ ] **Step 1: Failing tests** (`location.test.mjs`, node assert, same style as `desktopNotify.test.mjs`): `distanceMeters` Bengaluru→Mysuru ≈ 127 km (±2 km); `shouldSendUpdate` cases (null→true; 10 s/500 m→false; 20 s/5 m→false; 20 s/25 m→true; 65 s/0 m→true); `mapsUrl(1.5, -2.25)` → `https://www.google.com/maps?q=1.5,-2.25`; `liveStatus` pin/live/ended including **past `liveUntil` with `liveEnded: false` → 'ended'**; `formatLiveCaption` for 3 cases; `geolocationErrorMessage({code:1})` → the toast copy; `acquireLiveLock` with an in-memory storage: tab A gets it, tab B refused at +10 s, tab B gets it at +31 s (stale), tab A re-acquiring its own fresh lock → true.
- [ ] **Step 2:** `node src/utils/location.test.mjs` → FAIL.
- [ ] **Step 3:** Implement helpers.
- [ ] **Step 4:** Implement the hook: one-shot `getCurrentPosition({enableHighAccuracy:true, timeout:15000, maximumAge:30000})`; send via `socket.emit('chat.send', {receiverId, conversationId, type:'location', content:'📍 Location', metadata})` or `group.send`; live uses `watchPosition` + `shouldSendUpdate` → `location.update`; clears the watch at `liveUntil`, on stop, or when the message becomes ended. **Resume:** on mount/reconnect, for each message in `messages` where `senderId === user.id` and `liveStatus === 'live'`, start watching — guarded by `acquireLiveLock(localStorage, …)`, re-acquired every 10 s, so only one tab sends. `supported` is false when `navigator.geolocation` is missing or Task 1 recorded `fails` and `window.justusDesktop?.isDesktop`.
- [ ] **Step 5:** `npm test` → PASS (media + location tests).
- [ ] **Step 6:** Commit `feat(frontend): location helpers and sharing hook`.

### Task 5: Frontend — LocationMessage bubble in DM and group views

**Files:**
- Create: `frontend/src/components/chat/messages/LocationMessage.jsx`
- Modify: `frontend/package.json` (dependency `leaflet@^1.9.4`)
- Modify: `frontend/src/components/chat/layout/ChatMessages.jsx` (~line 207 type dispatch; exclude `location` from the generic file branch at ~line 227; reply label ~line 118)
- Modify: `frontend/src/components/chat/input/ReplyPreview.jsx` (`case 'location'`)
- Modify: `frontend/src/pages/groups/GroupChatPage.jsx` (`renderAttachment` ~line 319)
- Modify: `frontend/src/services/socket.jsx` (forward `location.updated` to `handlers.onLocationUpdated`), `frontend/src/hooks/useChatSocket.jsx` and `frontend/src/hooks/useGroupSocket.jsx` (patch `metadata` of the matching message; **ignore ids not in the list**)
- Modify: `frontend/src/utils/desktopNotify.js` (+ test) — `location` label

**Interfaces:**
- Consumes: `liveStatus`, `formatLiveCaption`, `mapsUrl` (Task 4); `stopLiveLocation` (Task 4) passed down as `onStopLive(messageId)`.
- Produces: `<LocationMessage message={msg} mine={bool} onStopLive={fn} theme={'dark'|'light'} />`.

- [ ] **Step 1: Failing tests:** `desktopNotify.test.mjs` — `type:'location'` → body `📍 Location`; with `metadata.live` → `📍 Live location`. `location.test.mjs` — add `applyLocationUpdate(list, event)` pure reducer test (exported from `utils/location.js`): patches matching id's metadata; **returns the same array when id not present**.
- [ ] **Step 2:** Run both test files → FAIL.
- [ ] **Step 3:** Implement `applyLocationUpdate(list, event) -> list` and the label; `LocationMessage` renders a non-interactive Leaflet map (`dragging/zoom/scrollWheel` off, zoom 15, OSM tile URL `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` with attribution `© OpenStreetMap`) lazily via `import('leaflet')`, caption per `formatLiveCaption`, re-renders every 30 s while live, `Stop sharing` for `mine && live`, whole map is a link to `mapsUrl` (`target="_blank" rel="noopener noreferrer"`). Wire into both views and the socket handlers.
- [ ] **Step 4:** Tests PASS; `npm run build` succeeds and Leaflet lands in a separate chunk (check `build/assets` for a leaflet chunk, main `index-*.js` size within +5 KB of before).
- [ ] **Step 5:** Commit `feat(frontend): location message bubble`.

### Task 6: Frontend — 📍 entry point in the compose bar

**Files:**
- Create: `frontend/src/components/chat/input/LocationMenu.jsx`
- Modify: `frontend/src/components/chat/input/ComposeBar.jsx` (new props, button next to attach ~line 163)
- Modify: `frontend/src/pages/chat/ChatPage.jsx` and `frontend/src/pages/groups/GroupChatPage.jsx` (call `useLocationSharing`, pass props)

**Interfaces:**
- Consumes: `useLocationSharing` (Task 4).
- Produces: `ComposeBar` new props `onSendLocation(): void`, `onStartLiveLocation(durationMs): void`, `locationSupported: boolean`, `locationBusy: boolean`; `LocationMenu({ onSendCurrent, onStartLive, onClose, colors })` with items `Send current location`, `Share live location` → `15 minutes` / `1 hour` / `8 hours`.

- [ ] **Step 1:** Implement `LocationMenu` and the button (`title="Share location"`, disabled while `locationBusy` or no chat). When `locationSupported` is false, the button shows the unsupported copy as a toast instead of the menu.
- [ ] **Step 2:** Wire both pages.
- [ ] **Step 3:** `npm run build` and `npx eslint` on changed files: no new findings vs `main` (same comparison method as PR #6).
- [ ] **Step 4:** Commit `feat(frontend): share location from the compose bar`.

### Task 7: End-to-end verification and ship

**Files:**
- Test (scratch, not committed): two-desktop-instance UI script, local stack (in-memory MongoDB + backend + `vite preview`), geolocation overridden per instance via CDP `Emulation.setGeolocationOverride`; **unregister the service worker and clear caches before each run.**

- [ ] **Step 1: UI checks:** pin in DM renders map + caption on both sides; live share moves on the receiver when the sender's override moves 100 m; `Stop sharing` → `Live location ended` on both; (expiry itself is covered by Task 3's integration test, not here); reload on receiver keeps latest point; sender reload resumes sending (one tab only); group member sees pin without opening the group; delete for everyone removes it; receiver delete-for-me hides it and later updates don't bring it back; desktop toast reads `📍 Location`.
- [ ] **Step 2:** Rebuild installer (`cd desktop && npm run dist`), reinstall silently, confirm the installed app can send a location (or shows the unsupported copy per Task 1).
- [ ] **Step 3:** Open PR, request merge from the user, then deploy (Render manual trigger, `vercel --prod` from `frontend/`), and repeat a live pin + live share between the two E2E accounts on production.
