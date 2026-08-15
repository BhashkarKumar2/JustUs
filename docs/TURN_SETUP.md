# TURN Setup — Cloudflare Realtime

How to get the two environment variables that enable relayed WebRTC calls:

```
CLOUDFLARE_TURN_KEY_ID
CLOUDFLARE_TURN_API_TOKEN
```

Until both are set, the app runs STUN-only. Calls still connect when at least
one peer is directly reachable, but fail when both sides are behind restrictive
NAT — most commonly when one person is on mobile data.

---

## Heads up: there are two different tokens

This is the easiest part to get wrong. Cloudflare uses similar names for two
unrelated secrets:

| Secret | Where it comes from | What it is for |
|---|---|---|
| **Account API token** | My Profile → API Tokens | Used **once**, to create the TURN key |
| **TURN key token** | Returned when you create the TURN key | What the backend uses to mint call credentials |

`CLOUDFLARE_TURN_API_TOKEN` is the **second** one. Putting the account API token
there will fail with a 401 at call time.

If you create the key through the dashboard you only ever see the second one,
and this distinction does not come up. It matters only for the API route below.

---

## Step 1 — Create the TURN key

### Option A: Dashboard (simpler)

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Go to **Realtime** in the left sidebar, then the **TURN** tab.
3. Select **Create** and give the key a name (e.g. `justus-prod`).
4. Cloudflare shows a **Key ID** and a **token / secret**. Copy both now — the
   token is shown once and cannot be retrieved later.

If the sidebar labels differ, the product was previously called **Calls**, so
look for that. The API route below is stable regardless of dashboard changes.

### Option B: API

First create an account API token at **My Profile → API Tokens → Create Token**,
using a custom token with the **Realtime → Realtime Admin** permission (older
accounts may show this as **Calls**).

Then, with that token and your account ID:

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/calls/turn_keys" \
  -H "Authorization: Bearer $ACCOUNT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "justus-prod"}'
```

The response contains what you need:

```json
{
  "success": true,
  "result": {
    "uid": "<-- this is CLOUDFLARE_TURN_KEY_ID",
    "key": "<-- this is CLOUDFLARE_TURN_API_TOKEN",
    "name": "justus-prod"
  }
}
```

Your account ID is on the right-hand sidebar of any domain's overview page, or
in the dashboard URL: `dash.cloudflare.com/<account-id>/...`

---

## Step 2 — Verify the values before deploying

Do this before touching Render. It takes ten seconds and settles whether you
copied the right token:

```bash
curl -X POST \
  "https://rtc.live.cloudflare.com/v1/turn/keys/$CLOUDFLARE_TURN_KEY_ID/credentials/generate-ice-servers" \
  -H "Authorization: Bearer $CLOUDFLARE_TURN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttl": 7200}'
```

**Expected:** HTTP 201 with an `iceServers` payload containing
`turn.cloudflare.com` URLs plus a generated `username` and `credential`.

**If you get 401:** you almost certainly used the account API token instead of
the TURN key's token. See the table at the top.

**If you get 404:** the Key ID is wrong — check for a copied trailing space.

---

## Step 3 — Set them locally

Add to `backend/.env` (already gitignored):

```
CLOUDFLARE_TURN_KEY_ID=<uid from step 1>
CLOUDFLARE_TURN_API_TOKEN=<key from step 1>
```

Start the backend and hit the endpoint with a valid login:

```bash
curl -H "Authorization: Bearer <your JWT>" http://localhost:5000/api/config/webrtc
```

Look for `"turnSource": "cloudflare"` in the response. `"none"` means the
variables were not picked up; `"static"` means it fell back to the old coturn
variables.

---

## Step 4 — Set them on Render

The Render CLI (v2.21) has **no environment-variable subcommand**, so this has
to be done through the dashboard or the REST API.

**Dashboard (recommended):** open the `justus-9hwt` service
(`srv-d2jho3emcj7s73ct8btg`) → **Environment** → **Add Environment Variable** →
add both → **Save Changes**. Render redeploys automatically.

**REST API**, if you prefer. Requires a Render API key from Account Settings →
API Keys. Use the **single-variable** endpoint, one call per variable:

```bash
curl -X PUT \
  "https://api.render.com/v1/services/srv-d2jho3emcj7s73ct8btg/env-vars/CLOUDFLARE_TURN_KEY_ID" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value": "..."}'
```

> **Do not** use the bulk `PUT /v1/services/{id}/env-vars` endpoint unless you
> intend to. It replaces the service's entire variable list — anything omitted
> is deleted, which would wipe `MONGODB_URI`, `JWT_SECRET`, and the rest.

Unlike the dashboard, API changes are **not deployed automatically**. Trigger a
deploy afterwards, either from the dashboard or with
`render deploys create srv-d2jho3emcj7s73ct8btg` (requires `render login`).

---

## Step 5 — Verify calling actually relays

Unit tests cover the credential logic, but only a real call proves the relay
path works. Two browser tabs on one machine will **not** test this — they
connect directly and never touch TURN.

You need two devices on different networks:

1. Phone on **mobile data** (carrier NAT blocks direct connections, forcing the
   relay), laptop on **Wi-Fi**.
2. Place a call between them.
3. In the browser console, confirm the log line reads `turnSource= cloudflare`.
4. Open `chrome://webrtc-internals`, find the active connection, and confirm the
   **selected candidate pair has type `relay`**. That is the proof.

If the call connects with candidate type `srflx` or `host`, it found a direct
path and TURN was not exercised — the test was not restrictive enough.

---

## Cost

Cloudflare's free tier covers 1,000 GB/month, shared between TURN and their SFU.

A relayed video call uses roughly 1.35 GB/hour; audio-only is about 50× less.
Only 10–20% of calls need the relay at all. For an app of this size the free
tier is not a realistic constraint. Usage is visible under **Realtime →
Analytics**.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `turnSource: "none"` | Env vars unset or misspelled; check the backend logs for the `[config]` warning |
| `turnSource: "static"` | Cloudflare call failed and it fell back; check logs for `[turn] Cloudflare credential fetch failed` |
| `turnSource: "unreachable"` | Frontend could not reach the backend at all — this is the client-side fallback |
| 401 from the verify curl | Wrong token — see the two-tokens table above |
| Calls work on Wi-Fi, fail on mobile data | The classic no-TURN signature; this whole document is the fix |

## Related

- Design rationale: [`superpowers/specs/2026-08-16-cloudflare-turn-design.md`](superpowers/specs/2026-08-16-cloudflare-turn-design.md)
- Variable reference: `backend/.env.example`
- [Cloudflare TURN docs](https://developers.cloudflare.com/realtime/turn/)
