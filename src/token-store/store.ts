import fs from 'fs/promises';
import path from 'path';
import { AccessTokenStore, OAuthFlow, UserTokenMeta } from '../types';
import { logger } from '../utils/logger';

const STORE_PATH = path.join(process.cwd(), '.mcp_token_store.json');

// One-time migration: the legacy single-slot `user_access_token` came from the
// most recent connect, which was the Consumer app. Move it to the consumer slot.
function migrateLegacy(raw: any): AccessTokenStore {
  if (raw && raw.user_access_token && !raw.consumer_user_access_token) {
    raw.consumer_user_access_token = raw.user_access_token;
    raw.consumer_token_meta = raw.user_token_meta;
  }
  delete raw.user_access_token;
  delete raw.user_token_meta;
  raw.page_access_tokens = raw.page_access_tokens || {};
  return raw as AccessTokenStore;
}

export async function readTokens(): Promise<AccessTokenStore> {
  try {
    const data = await fs.readFile(STORE_PATH, 'utf-8');
    return migrateLegacy(JSON.parse(data));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { page_access_tokens: {} };
    }
    logger.error('Failed to read token store:', error.message || error);
    return { page_access_tokens: {} };
  }
}

export async function writeTokens(tokens: AccessTokenStore): Promise<void> {
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
    logger.info('Tokens successfully saved to store.');
  } catch (error) {
    logger.error('Failed to write to token store:', error);
  }
}

// ── User tokens, split per app ───────────────────────────────────────────────

export async function saveUserAccessToken(
  flow: OAuthFlow,
  token: string,
  meta?: UserTokenMeta
): Promise<void> {
  const current = await readTokens();
  if (flow === 'consumer') {
    current.consumer_user_access_token = token;
    current.consumer_token_meta = meta;
  } else {
    current.business_user_access_token = token;
    current.business_token_meta = meta;
  }
  await writeTokens(current);
}

export async function getConsumerUserAccessToken(): Promise<string | undefined> {
  const current = await readTokens();
  return current.consumer_user_access_token;
}

export async function getBusinessUserAccessToken(): Promise<string | undefined> {
  const current = await readTokens();
  return current.business_user_access_token;
}

// Kept for compatibility: personal-account code wants the Consumer token.
export async function getUserAccessToken(): Promise<string | undefined> {
  return getConsumerUserAccessToken();
}

export async function hasConsumerToken(): Promise<boolean> {
  return !!(await getConsumerUserAccessToken());
}

export async function hasBusinessToken(): Promise<boolean> {
  return !!(await getBusinessUserAccessToken());
}

export async function getUserTokenMeta(flow: OAuthFlow): Promise<UserTokenMeta | undefined> {
  const current = await readTokens();
  return flow === 'consumer' ? current.consumer_token_meta : current.business_token_meta;
}

// ── Page tokens ──────────────────────────────────────────────────────────────

export async function savePageAccessToken(pageId: string, token: string): Promise<void> {
  const current = await readTokens();
  if (!current.page_access_tokens) {
    current.page_access_tokens = {};
  }
  current.page_access_tokens[pageId] = token;
  await writeTokens(current);
}

export async function getPageAccessToken(pageId: string): Promise<string | undefined> {
  const current = await readTokens();
  return current.page_access_tokens?.[pageId];
}
