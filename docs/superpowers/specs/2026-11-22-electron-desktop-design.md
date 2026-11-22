# JustUs Desktop (Electron) — design

**Goal:** an installable Windows app for JustUs that feels close to WhatsApp Desktop
(own window, tray, native notifications, taskbar unread badge), without rewriting the UI.

## Approaches considered
- **Electron shell loading the deployed site (chosen).** Reuses 100% of the React app,
  WebRTC calls work unchanged (Chromium), cookie auth unchanged (same https origin as the web).
- **Electron bundling the built frontend locally.** Rejected: page origin becomes `file://`/`app://`,
  so the `sameSite: 'lax'` auth cookies + CORS allowlist would need backend changes.
- **React Native for Windows.** Rejected by the user after review: full UI rewrite (~13k lines),
  and react-native-webrtc does not support Windows, so calls would be lost.

## Design
- `desktop/` package. A `BrowserWindow` with a hidden native frame shows a 32px branded title bar
  (`titlebar.html`, native min/max/close via `titleBarOverlay`); the JustUs site is a
  `WebContentsView` beneath it. URL is a single setting (`JUSTUS_URL` env or `src/config.js`).
- Close → hide to tray. Tray menu: Open, Reload, Launch on startup (toggle), Quit. Single instance.
- Window bounds persisted to `userData/window-state.json`.
- Permissions (mic, camera, notifications, clipboard, fullscreen) auto-granted **only** for the JustUs origin.
  Off-origin links/popups open in the system browser.
- Load failure → local offline page with Retry.
- **Notifications:** the web app only uses Web Push (service worker), which Electron doesn't support.
  So the frontend gets a tiny, browser-inert hook in `services/socket.jsx`: on incoming `message`,
  `group.message`, `call.offer`, `video-call.offer` from someone else, call
  `window.justusDesktop?.notify(...)`. Encrypted messages show "🔒 New message" (no decryption in the shell path).
- Shell suppresses toasts while the window is focused. Unread badge = messages received while unfocused
  (Windows taskbar overlay icon + "(n)" in title), cleared on focus. Taskbar flashes on new messages.
  Incoming calls show the window (inactive) + a toast.
- `npm run dist` → NSIS installer via electron-builder.

## Non-goals (for now)
Shell auto-update; two-pane WhatsApp-style layout (separate frontend change); Render cold-start fix.
