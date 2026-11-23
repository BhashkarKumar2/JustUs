# Location sharing — design

Date: 2026-11-23 · Status: awaiting approval

## Intent

Let JustUs users share where they are, two ways, like WhatsApp:

- **Current location**: a one-time pin ("I'm here").
- **Live location**: a position that keeps updating for a chosen time so the other person can follow along (e.g. "on my way").

Works in direct chats and groups, in the browser and in the Windows desktop app.

## Goals

- A 📍 option next to the 📎 attach button in the compose bar (DMs and groups) with two choices: *Send current location* and *Share live location*.
- Live location: pick a duration (15 min / 1 h / 8 h), see it move in the chat, stop it any time.
- The bubble shows a small map with a marker; tapping it opens the spot in Google Maps in a new tab (system browser in the desktop app).
- Works for people who open the chat later: they see the pin, or the latest live position and when it was last updated.

## Non-goals

- Background tracking with the phone locked or the tab hidden. Browsers stop location updates then. This needs a native mobile app, which JustUs isn't.
- Location history or trails. Only the latest live point is kept.
- Picking a place on the map, or searching for one. You share your own position only.
- Paid map services or API keys.

## Anti-goals (would make it a failure even if it "works")

- Live sharing that silently keeps going: it must always end, at the chosen time or on Stop, server-side too.
- Leaking location to anyone outside the chat.
- Anything that slows down normal messaging or breaks existing message types.

## Constraints and facts found in the code

- Messages have a free-form `type` and `metadata` (`backend/src/models/Message.js`); new type `location` fits without a migration.
- DMs render in `frontend/src/components/chat/layout/ChatMessages.jsx` (+ `messages/MessageItem.jsx`); groups render separately in `frontend/src/pages/groups/GroupChatPage.jsx`. Both need the new bubble.
- DM sends go through `chat.send`, groups through `group.send` (`backend/src/websocket/socketHandler.js`). Group sockets are now in all of the user's group rooms (PR #6), so live updates reach group members without opening the group.
- DM text is encrypted when both users' keys are available; group messages, images and files are stored readable on the server.
- The desktop shell only allows a fixed permission list (`desktop/src/main.js` `ALLOWED_PERMISSIONS`); `geolocation` is not in it, so the shell must change and **the installer must be rebuilt and reinstalled** (the shell is bundled, unlike the site).
- Desktop accuracy depends on Windows Location being on; laptops without GPS get a Wi-Fi/IP estimate (street to city level). Whether Electron 45's geolocation works on Windows with no Google API key must be verified first (see Risks).
- No CSP on the Vercel-hosted frontend, so map tiles from OpenStreetMap load without config changes.

## Approaches considered

- **A. Location is a message; live updates edit that message** (chosen). Pin = a `location` message. Live = the same type with `live: true`; the sender's app pushes positions over the socket and the server updates the stored message and rebroadcasts. Works in DMs and groups and survives reloads; latecomers see the latest point. The server holds the latest coordinates while sharing.
- B. Live positions relayed over the socket, never stored. More private, but only people online at that moment see it move; latecomers see nothing.
- C. No map; a card with the address and "Open in Maps". Cheapest, but much less pleasant.

The user picked **A**.

## Design

### Data

`Message` with `type: 'location'`, `metadata`:

```
{
  lat, lng,            // degrees, rounded to 6 decimals
  accuracy,            // metres, from the browser
  live: boolean,
  liveUntil: Date,     // live only: when it ends
  liveEnded: boolean,  // live only: set on Stop / expiry
  updatedAt: Date      // last position time
}
```

`content` holds a plain fallback string ("📍 Location" / "📍 Live location") so older clients, reply previews, notifications and search show something sensible.

### Sending

- Compose bar: new 📍 button → small menu: *Send current location* | *Share live location* → (live) duration choice 15 min / 1 h / 8 h.
- The browser asks for permission on first use. Denied, unavailable or timed out → a clear toast ("Location is off — enable it in your browser / Windows settings"); nothing is sent.
- Pin: one `getCurrentPosition` (high accuracy, 15 s timeout) → send as a normal message (`chat.send` / `group.send`) with the metadata above.
- *(my call)* If the sender reloads, reconnects or reopens the app while one of their live shares is still running, the app resumes watching and sending automatically (otherwise a desktop reload would silently freeze it).
- Live: same first fix, sent with `live: true, liveUntil`. Then `watchPosition` on the sender's device. A new socket event `location.update { messageId, lat, lng, accuracy }` goes out at most every 15 s, and only when moved ≥ 20 m or 60 s have passed (keeps traffic and battery low).

### Server

- `chat.send` / `group.send` accept `type: 'location'` with validated metadata (numeric lat −90..90, lng −180..180, `liveUntil` in the future and ≤ 8 h).
- `location.update`: only the original sender, only while `live && !liveEnded && now < liveUntil`; updates the message's metadata and emits `location.updated` to the DM's two user rooms or the group room.
- `location.stop { messageId }`: sender only; sets `liveEnded`, emits `location.updated`.
- Expiry: an update after `liveUntil` marks it ended; a light periodic sweep (every minute) ends overdue live shares, so they end even if the sender's app vanished.
- Delete for everyone on a live location also ends it (DM `chat.delete` and group `group.delete` paths).
- `location.update` gets its own per-socket limit (e.g. 1 per 5 s per message) so it can't be used to flood rooms; it does not count against the chat-message rate limit.
- *(my call)* One live share per person per chat: starting a new one ends your previous one in that chat.

### Receiving and display

- `location.updated` patches the message in place (DM and group views).
- Bubble: small map (Leaflet + OpenStreetMap tiles, ~200 px tall, not interactive inside the bubble), marker at the point, a caption under it:
  - pin: "📍 Location" (+ "± 30 m" when accuracy is poor);
  - live: "🟢 Live · until 6:40 PM · updated 1 min ago"; sender sees a **Stop sharing** button;
  - ended: "Live location ended", map shows the last point, greyed.
- Tapping the map opens `https://www.google.com/maps?q=lat,lng` (desktop app: system browser, already handled by the shell's external-link rule).
- Notifications (web push + desktop toasts): "📍 Location" / "📍 Live location"; no toast for position updates.
- Reply preview label: "Location".

### Desktop shell

- Add `geolocation` to `ALLOWED_PERMISSIONS` (still limited to the app's own origin).
- Rebuild the installer; reinstall.

### Privacy (my call, override if you want)

Coordinates are stored readable on the server, the same as images and group messages today; DM end-to-end encryption is not extended to location in this version, because live updates would each need re-encryption for every recipient. Only chat participants receive them, and live points are overwritten, not kept as a trail.

## Risks / verify first

1. **Electron geolocation on Windows** without a Google API key: spike it first. If it doesn't work, the desktop app shows "Location isn't available in the desktop app yet — use the website on your phone" instead of a 📍 option that silently fails; receiving and viewing locations still works there.
2. Live sharing from phones only updates while JustUs is open on screen (browser limitation); the bubble's "updated X min ago" makes a stalled share visible.

## Left to the builder

Exact component split, styling to match each view's existing bubbles and dark/light themes, map zoom level, Leaflet import strategy (lazy-load with the chat so the main bundle doesn't grow), sweep implementation (setInterval on the server is fine at this scale), tests.

## Testing

- Backend integration tests (in-memory MongoDB, as for PR #6): send pin/live in DM and group, sender-only update/stop, expiry and sweep, validation, delete ends live, non-participants never receive updates.
- UI tests with two desktop instances using Chromium's geolocation override: pin renders; live moves on the other side; stop and expiry update both sides; reload shows latest point; group member sees it without opening the group.
- Manual: real phone in the browser, and the installed desktop app on Windows with Location on/off.
