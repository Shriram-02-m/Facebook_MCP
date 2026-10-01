# Facebook MCP Server

A Model Context Protocol (MCP) server powered by **two separate Meta apps**:

1. **Consumer App** → operations on *your personal Facebook account* (Facebook Login).
2. **Business App** → *Page management* for Pages you administer (Login for Business).

Built on **Meta Graph API v26.0** (TypeScript, Express OAuth callback, Axios, MCP SDK with stdio + Streamable HTTP transports).

---

## 1. Why two apps

Meta binds permissions to an **app**, and app *type* is permanent:

| | Consumer app | Business app |
|---|---|---|
| Purpose | personal `/me` data | Page management |
| `/me` endpoints | ✅ | ❌ blocked (`#200 API access blocked`) |
| Page token chain (`/me/accounts`) | ❌ (pages scopes rejected in dialog) | ✅ |
| Auth style | scope-based consent | `config_id` (Login for Business config) |

Tokens from both flows are stored **side by side and never mixed**; every code path names its identity explicitly.

---

## 2. Environment (`.env`)

```env
# Meta App #1: Consumer (personal account)
CONSUMER_APP_ID=...
CONSUMER_APP_SECRET=...

# Meta App #2: Business (Page management)
BUSINESS_APP_ID=...
BUSINESS_APP_SECRET=...
BUSINESS_CONFIG_ID=...            # Login for Business configuration

PORT=3000                          # shared OAuth callback port
MCP_PORT=3001                      # Streamable HTTP port (HTTP transport)
INCLUDE_EMAIL=false                # consumer opt-in
CONNECT_PAGES=false                # consumer opt-in
```

Copy `.env.example` → `.env`. **Never hardcode credentials in source.** Register in BOTH app consoles:

```
http://localhost:3000/callback
```

(Consumer app: add **Facebook Login** product; Business app: keep **Facebook Login for Business** config.)

---

## 3. OAuth flows

Both flows share `http://localhost:3000/callback`. Facebook echoes back a cryptographically-random **`state`** generated at `facebook_connect` time; the server maps `state → consumer|business`. **Unknown/missing state ⇒ callback rejected** (we never guess which app a callback is for). State values are one-time-use. The App Secret is sent only in POST bodies and environment — never URLs, never logs.

### Consumer flow (personal)
```
facebook_connect {flow:"consumer"}
  → https://www.facebook.com/v26.0/dialog/oauth?client_id=CONSUMER_APP_ID
      &scope=public_profile,user_posts,user_photos,user_videos,user_likes,
             user_friends,user_age_range,user_birthday,user_gender,
             user_hometown,user_location,user_link
      &state=<random>
  → user approves → /callback?code&state
  → POST /oauth/access_token (code → short-lived)
  → POST /oauth/access_token (fb_exchange_token → long-lived ~60 days)
  → saved as consumer_user_access_token  (business slot untouched)
```

### Business flow (pages)
```
facebook_connect {flow:"business"}
  → dialog oauth?client_id=BUSINESS_APP_ID & config_id=BUSINESS_CONFIG_ID & state=<random>
     (config decides granted permissions — include pages_manage_metadata etc.
      in the config if Page cover/profile updates are needed)
  → /callback → token exchange (same two-step, POST bodies)
  → saved as business_user_access_token  (consumer slot untouched)

facebook_get_pages      # requires the business user token
  → GET /me/accounts → each Page's access_token
  → stored under page_access_tokens[PAGE_ID]

Any Page tool
  → getPageClient(pageId) → that Page token only
```

**Token expiry reality:** long-lived tokens arrive via the one-time `fb_exchange_token` exchange, but there is **no auto-refresh daemon**. When a token expires (~60 days) or is revoked (password change, app deauth), re-run `facebook_connect` with the matching flow. The two flows can be re-run independently.

---

## 4. Token store (`.mcp_token_store.json`, gitignored)

```json
{
  "consumer_user_access_token": "...",
  "consumer_token_meta":  { "obtained_at": "...", "expires_at": "...", "scopes": [...] },
  "business_user_access_token": "...",
  "business_token_meta":  { ... },
  "page_access_tokens": { "1326722813860832": "..." }
}
```
A legacy `user_access_token` is auto-migrated into the consumer slot.

---

## 5. Explicit token selection (`src/facebook-api/client.ts`)

```
Personal op  → getConsumerClient()      (consumer user token)
Page listing → getBusinessUserClient()  (business user token) → refreshes page tokens
Page op      → getPageClient(pageId)    (cached page token)
```
No implicit fallback client exists; the identity is readable at every call site.

---

## 6. MCP tools — flow classification

**Consumer (personal; read-only, Meta limitation):**
`facebook_connect{flow:consumer}`, `facebook_get_me`, `facebook_get_my_profile`,
`facebook_get_my_posts`, `facebook_get_my_photos`, `facebook_get_my_videos`,
`facebook_get_my_likes`, `facebook_get_my_friends`,
`facebook_check_token{flow:consumer|business}`, `facebook_share_dialog_url`.

**Business / Page (full read + write):**
`facebook_connect{flow:business}`, `facebook_get_pages` (caches page tokens),
`facebook_get_page`, `facebook_create_post`, `facebook_create_photo_post` (`publishToFeed` + verified), `facebook_update_post`,
`facebook_get_posts`, `facebook_get_comments`, `facebook_create_comment`, `facebook_reply_to_comment`,
`facebook_get_insights`, `facebook_delete_post`, `facebook_like_post`, `facebook_unlike_post`,
`facebook_get_cover`, `facebook_set_cover_photo`, `facebook_set_profile_picture`,
`facebook_bulk_like` (`postIds` or `all:true`), `facebook_bulk_comment` (dedupe-safe).

`facebook_get_comments`: page token first, consumer token fallback. Read tools summarize by default; `fields:"raw"` returns the full Graph node.

### Personal-account write matrix (Graph API v26.0 — verified live)

| Operation | Status | Reason |
|---|---|---|
| comment / reply as user | ❌ | `#3 publishing... only available for page access tokens` |
| post to own timeline | ❌ | `publish_actions` removed |
| like / unlike / react as user | ❌ | removed; `/me/likes` read still works |
| delete user post | ❌ | not supported |
| share as user | ⚠️ | browser Share Dialog (`facebook_share_dialog_url`) only |
| read own profile/posts/photos/videos/likes | ✅ | user scopes granted |
| friends list | ⚠️ | only friends using this app (nearly always empty) |

No tool pretends a dead endpoint exists.

---

## 7. Build, lint & test

```bash
npm install
npm run build          # tsc (strict, noImplicitAny, noUnusedLocals)

npm run lint           # eslint src (typescript-eslint, flat config)
npm run smoke          # scripts/smoke.js: stdio JSON-RPC handshake,
                       # asserts the full tool registry + that auth URLs
                       # never leak app secrets
npm test               # build && lint && smoke

# run the server
MCP_TRANSPORT=stdio node dist/server/index.js    # stdio (Claude Desktop etc.)
node dist/server/index.js                        # HTTP → /mcp + /health on MCP_PORT
node scripts/oauth_connect.js                    # standalone consumer OAuth
node scripts/oauth_connect.js business           # standalone business OAuth
```

Standalone helper scripts live in **`scripts/`** (post transfers, bulk like/comment prototypes, data dumps, manifest builders). They resolve `.mcp_token_store.json`, images and their JSON outputs relative to the **project root**, and use the same store: consumer token from `consumer_user_access_token`, page token from `page_access_tokens`.

### Response summarization

Read tools (`facebook_get_posts`, `facebook_get_comments`, `facebook_get_my_posts/photos/videos/likes`, `facebook_get_pages`, `facebook_get_insights`) return a **summarized** view by default: signed CDN `*_picture`/`source` URLs (300+ chars of noise for an LLM) are replaced with markers and long strings truncated. Pass `fields:"raw"` to any of them for the complete Graph API node.

---

## 8. Testing checklist

1. `facebook_connect {flow:"business"}` → authorize → store gains `business_user_access_token` only.
2. `facebook_get_pages` → lists Pages, caches `page_access_tokens` (outputs contain **no tokens**).
3. `facebook_create_post {pageId,...}` → works using the Page token.
4. `facebook_connect {flow:"consumer"}` → authorize → store gains `consumer_user_access_token` only; the business user token and page tokens stay.
5. `facebook_get_me` / `facebook_get_my_*` → personal data via consumer token.
6. `facebook_check_token {flow:"consumer"}` and `{flow:"business"}` → shows both slots' presence/expiry, live-scopes for requested flow, never secret values.
7. Wrong flow → tool error tells you which `facebook_connect flow=` to run.
8. Reuse of an old callback URL/state → rejected (state is one-time).

---

## 9. Security notes

* App Secrets: `.env` only; token exchange uses POST bodies so secrets never hit URLs/access-logs.
* Callback query is never logged wholesale (contains auth codes); only flow name + errors.
* Tool responses strip `access_token` from any Graph payload before returning.
* `.mcp_token_store.json` is gitignored; delete it to revoke locally-cached access.
* Meta-side revocation: change password / remove app in Settings → Apps & Websites kills the tokens; re-run the relevant `facebook_connect`.
