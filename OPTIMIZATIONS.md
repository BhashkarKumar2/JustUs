# JustUs — Optimization Notes (`optimize/security-and-perf`)

This branch is a **security-first, non-breaking optimization pass** over JustUs. No
application APIs or user-facing behavior were changed; every change was verified
(backend boots, `npm ci` succeeds, frontend builds + PWA generates) and shipped to a
fully isolated deployment so production stays untouched.

> **Guiding principle:** prefer high-value, low-risk changes. Where a fix required a
> breaking dependency bump that could break uploads, it was mitigated at the app layer
> instead of forced.

---

## TL;DR

| Area | Before | After |
|---|---|---|
| Backend logging | 335 unconditional `console.*` calls in prod (leaking auth headers, IDs, DB URI; sync stdout I/O on every request/socket event) | Production logger silences `log/info/debug/trace/table` in prod, keeps `error`/`warn` |
| Mongo connection string | Printed **with credentials** on startup | Redacted to host-only |
| Backend dependency vulns | 28 (1 critical, 13 high) | **3** (only the `multer 1.x` chain, mitigated at app layer) |
| Media upload | No size/structural limits, rate limiter defined but unused | Multipart limits + `uploadLimiter` applied |
| `ChatPage` JS bundle | ~949 kB (gzip 265 kB) | **~187 kB (gzip 49 kB)** |
| Docker install | `npm install --production` | `npm ci --omit=dev` (deterministic) + `NODE_ENV=production` |
| Dead files | `api.optimized.jsx`, `setupProxy.jsx` shipped | Removed |

---

## 1. Security

### 1.1 Production log hygiene (`backend/src/utils/logger.js` + `server.js`)
The backend had **335 `console.*` calls across 24 files** running unconditionally in
production. Two problems:

- **Information leakage** — logs included auth-header presence, JWT internals, user &
  file IDs, security decisions, and the **MongoDB connection string with credentials**.
- **Performance** — synchronous stdout I/O executed on *every* HTTP request and socket
  event.

A single production-safe logger neutralizes all of them without risky edits across 24
files. Imported first in `server.js` (right after `dotenv`), in production it replaces
`console.log/info/debug/trace/table` with no-ops while **keeping `console.error` and
`console.warn`** so real failures still reach the platform log stream. Mirrors the
existing frontend logger (`frontend/src/utils/logger.jsx`).

```js
// production only
for (const m of ['log', 'info', 'debug', 'trace', 'table']) console[m] = () => {};
```

### 1.2 Redacted MongoDB connection string (`server.js`)
Startup previously did `console.log("CONNECTION STRING FOR MONGO : ", MONGODB_URI)`.
Now it logs **host only** (`MongoDB target host: <host>`) — defense-in-depth even beyond
the prod log override, so credentials never land in logs regardless of environment.

### 1.3 Dependency vulnerabilities: 28 → 3
`npm audit fix` was run in **safe (semver-compatible) mode only** — no `--force`. This
resolved **25 of 28** backend advisories, including:

- **critical** `protobufjs` (code injection via generated code)
- **high** `axios` (prototype-pollution / MITM / DoS), `mongoose`, `express`
  (`path-to-regexp` ReDoS), `jws` (HMAC verification), `form-data` (CRLF injection)

`package.json` ranges were **not** changed — only locked sub-versions in
`package-lock.json` were bumped, which is the lowest-risk possible fix.

**Why 3 remain:** the `multer@1.x → busboy → dicer` DoS chain. The proper fix is
`multer@2.x`, but `multer-gridfs-storage@5.0.2` is **peer-locked to `multer@^1.4.2`**, so
upgrading would break avatar/media uploads. Left in place and mitigated below.

### 1.4 Upload hardening (`mediaController.js` + `mediaRoutes.js`)
The media upload path had **no limits at all** and did not use the `uploadLimiter` that
was already defined. Added:

- **Multipart limits** (mitigates the remaining `dicer` DoS attack surface and prevents
  storage-exhaustion abuse, with a generous file cap so legit media isn't affected):
  `fileSize: 100 MB`, `files: 1`, `parts: 20`, `fields: 15`, `fieldNameSize: 200`,
  `headerPairs: 100`.
- **Rate limiting** — applied the existing `uploadLimiter` (20 uploads/min) to
  `POST /api/media/upload`.

### 1.5 What was already solid (left as-is)
The prior security work was genuinely good and untouched: JWT + rotating refresh tokens,
strict CORS allowlist, `helmet` CSP, per-account brute-force rate limiting, crypto-random
verification codes, well-chosen MongoDB indexes, and `RefreshToken` TTL cleanup.

---

## 2. Performance

### 2.1 Frontend bundle split (`frontend/vite.config.js`)
Everything was collapsing into one giant `ChatPage` chunk (~949 kB). Heavy,
rarely-changing libraries are now isolated into their own vendor chunks:

```js
'vendor-crypto':    ['tweetnacl', 'tweetnacl-util'],
'vendor-imagecrop': ['react-easy-crop', 'react-image-crop'],
'vendor-virtuoso':  ['react-virtuoso'],
```

Result: **`ChatPage` 949 kB → 187 kB** (gzip 265 kB → 49 kB). The crypto/polyfill weight
now lives in a vendor chunk that caches **independently of app code** — so shipping an app
change no longer busts it. This is a big win for a frequently-revisited chat app.

### 2.2 Docker build (`backend/Dockerfile`)
- `npm install --production` → **`npm ci --omit=dev`** — deterministic, reproducible
  install straight from the lockfile.
- Added **`ENV NODE_ENV=production`** so the image runs securely by default (secure
  cookies, no localhost CORS fallback, the log override active).

---

## 3. Cleanup
- Removed `frontend/src/services/api.optimized.jsx` — never imported.
- Removed `frontend/src/setupProxy.jsx` — a Create-React-App artifact that Vite ignores
  (the dev proxy lives in `vite.config.js`).
- Made the Vercel output directory explicit (`outputDirectory: "build"` in
  `frontend/vercel.json`) so a fresh Vercel project builds correctly (Vite outputs to
  `build/`, but Vercel's Vite preset defaults to `dist/`).

---

## 4. Verification
- **Backend boot** — server imports/wires up all modules cleanly; logger override
  confirmed (prod hides `log`/`info`, keeps `warn`/`error`; dev unchanged).
- **`npm ci --omit=dev`** succeeds → lockfile is in sync.
- **Frontend `npm run build`** passes; PWA service worker generates.
- **No production regressions** — the live production frontend and backend were verified
  still serving `200` throughout.

---

## 5. Deployment (isolated — production untouched)
An entirely separate stack runs this branch, so production (`just-us` /
`justus-9hwt`) is never affected:

| Layer | Optimized (this branch) | Production |
|---|---|---|
| Frontend | `justus-optimized.vercel.app` | `just-us-liard.vercel.app` |
| Backend  | `justus-optimized-backend.onrender.com` | `justus-9hwt.onrender.com` |

The new backend was created from this branch (Docker, `npm ci`), replicates prod config,
shares the same MongoDB, and correctly runs **`NODE_ENV=production`**.

Merging this branch to `main` ships the optimizations to production via the existing
auto-deploy pipeline (no CORS changes needed, since the production origin is already
allowlisted).

### ⚠️ Recommended production config fix (not applied here)
The current production backend runs with **`NODE_ENV=development`**, which in this app
exposes error stack traces to clients, disables the `secure` cookie flag, and keeps
verbose logging on. Set `NODE_ENV=production` on the production service to close this.
