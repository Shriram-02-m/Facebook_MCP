# Facebook MCP Server

A Model Context Protocol (MCP) server that enables AI Assistants to interact with Facebook Pages, Posts, Comments, and Insights using the Facebook Graph API v26.0.

---

## 📁 Required Credentials & Setup

### 1. Create a Facebook Developer App
1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Create an App (or select an existing one).
3. Under **App settings > Basic**, note down your **App ID** and **App Secret**.
4. Add **Facebook Login** product to your app.
5. In **Facebook Login > Settings**, add the following under **Valid OAuth Redirect URIs**:
   ```
   http://localhost:3000/callback
   ```

### 2. Configure Environment Variables
Create a `.env` file inside the `mcp-server` directory (copied from `.env.example`):

```env
APP_ID=your_facebook_app_id_here
APP_SECRET=your_facebook_app_secret_here
PORT=3000
```

---

## 🚀 Installation & Build

```bash
cd mcp-server
npm install
npm run build
```

---

## ⚙️ MCP Client Configuration

To connect this server to an MCP Client (such as Claude Desktop or Gemini Antigravity IDE), add the following entry to your configuration file:

```json
{
  "mcpServers": {
    "facebook": {
      "command": "node",
      "args": [
        "c:/Users/shrir/Music/office_work/Facebook/mcp-server/dist/server/index.js"
      ],
      "env": {
        "APP_ID": "your_facebook_app_id_here",
        "APP_SECRET": "your_facebook_app_secret_here",
        "PORT": "3000"
      }
    }
  }
}
```

---

## 🛠️ Available MCP Tools

| Tool | Description | Required Parameters |
|---|---|---|
| `facebook_connect` | Starts local OAuth server and returns authorization URL | None |
| `facebook_get_pages` | Retrieves authorized Facebook Pages & caches page access tokens | None |
| `facebook_get_page` | Retrieves details for a specific Page | `pageId` |
| `facebook_create_post` | Publishes a post to a Facebook Page | `pageId`, `message` |
| `facebook_get_posts` | Retrieves recent posts from a Page | `pageId`, `limit` (optional) |
| `facebook_get_comments` | Retrieves comments on a specific post | `postId`, `limit` (optional) |
| `facebook_reply_to_comment` | Replies to a comment on a Page | `pageId`, `commentId`, `message` |
| `facebook_get_insights` | Retrieves metrics/analytics for a Page | `pageId`, `metric` |
| `facebook_delete_post` | Deletes a post from a Page | `pageId`, `postId` |

---

## 🔒 Token Security
Tokens are automatically retrieved during authentication and stored locally in `.mcp_token_store.json` (which is excluded via `.gitignore`).
